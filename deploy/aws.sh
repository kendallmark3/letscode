#!/usr/bin/env bash
# Simple AWS deployment for Let's Go!: one small EC2 server (data on its own disk)
# behind CloudFront, which provides the public https address.
#
#   AWS_PROFILE=mkendall deploy/aws.sh          create everything, print the URL
#   AWS_PROFILE=mkendall deploy/aws.sh update   restart the server on the latest main
#   AWS_PROFILE=mkendall deploy/aws.sh destroy  remove everything this script created
#
# The server has no SSH and accepts traffic only from CloudFront. The organizer
# password is generated here, saved to var/aws-organizer.txt and never committed.
set -euo pipefail
export AWS_PAGER="" AWS_REGION="${AWS_REGION:-us-east-2}"
REPO="${REPO:-https://github.com/kendallmark3/letscode.git}"
ORGANIZER_EMAIL="${ORGANIZER_EMAIL:-organizer@example.com}"
TAG="letsgo"
root="$(cd "$(dirname "$0")/.." && pwd)"

tagged() { echo "ResourceType=$1,Tags=[{Key=Project,Value=$TAG},{Key=Name,Value=$TAG}]"; }
instance_id() { aws ec2 describe-instances --filters "Name=tag:Project,Values=$TAG" Name=instance-state-name,Values=pending,running,stopping,stopped --query 'Reservations[0].Instances[0].InstanceId' --output text; }
sg_id() { aws ec2 describe-security-groups --filters "Name=group-name,Values=$TAG" --query 'SecurityGroups[0].GroupId' --output text; }
eip() { aws ec2 describe-addresses --filters "Name=tag:Project,Values=$TAG" --query "Addresses[0].$1" --output text; }
dist() { aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='$TAG'] | [0].$1" --output text; }

case "${1:-create}" in
update)
  aws ec2 reboot-instances --instance-ids "$(instance_id)"
  echo "Restarting on the latest main. Back in about a minute at https://$(dist DomainName)"
  exit ;;
destroy)
  id="$(dist Id)"
  if [ "$id" != "None" ]; then
    echo "CloudFront distribution $id must be disabled and then deleted in the console (it takes several minutes to disable)."
  fi
  inst="$(instance_id)"; [ "$inst" != "None" ] && aws ec2 terminate-instances --instance-ids "$inst" >/dev/null && aws ec2 wait instance-terminated --instance-ids "$inst"
  alloc="$(eip AllocationId)"; [ "$alloc" != "None" ] && aws ec2 release-address --allocation-id "$alloc"
  sg="$(sg_id)"; [ "$sg" != "None" ] && aws ec2 delete-security-group --group-id "$sg" >/dev/null
  echo "Server, address and firewall removed. All data on the server is gone."
  exit ;;
esac

[ "$(instance_id)" = "None" ] || { echo "Already deployed: https://$(dist DomainName)"; exit 0; }

vpc="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
subnet="$(aws ec2 describe-subnets --filters Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)"
ami="$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 --query Parameter.Value --output text)"
cf_list="$(aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query 'PrefixLists[0].PrefixListId' --output text)"

echo "1/4 Firewall: only CloudFront may reach the server"
sg="$(sg_id)"
if [ "$sg" = "None" ]; then
  sg="$(aws ec2 create-security-group --group-name "$TAG" --description "Lets Go app port from CloudFront only" --vpc-id "$vpc" --tag-specifications "$(tagged security-group)" --query GroupId --output text)"
  aws ec2 authorize-security-group-ingress --group-id "$sg" --ip-permissions "IpProtocol=tcp,FromPort=4747,ToPort=4747,PrefixListIds=[{PrefixListId=$cf_list,Description=CloudFront}]" >/dev/null
fi

echo "2/4 Server"
mkdir -p "$root/var"
secret="$root/var/aws-organizer.txt"
[ -f "$secret" ] || { umask 077; printf '%s\n' "$(openssl rand -base64 18 | tr -d '/+=')" > "$secret"; }
userdata="$(mktemp)"
cat > "$userdata" <<USERDATA
#!/bin/bash
set -euxo pipefail
dnf install -y git tar xz
curl -fsSL https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-arm64.tar.xz | tar -xJ -C /opt
ln -sf /opt/node-v22.12.0-linux-arm64/bin/node /usr/local/bin/node
useradd --system --create-home --home-dir /srv/letsgo letsgo
sudo -u letsgo git clone "$REPO" /srv/letsgo/app
sudo -u letsgo mkdir -p /srv/letsgo/data
cat > /etc/letsgo.env <<ENV
PORT=4747
HOST=0.0.0.0
DATA_FILE=/srv/letsgo/data/state.json
ORGANIZER_EMAIL=$ORGANIZER_EMAIL
ORGANIZER_PASSWORD=$(cat "$secret")
SECURE_COOKIES=1
TRUST_PROXY=1
ENV
chmod 600 /etc/letsgo.env
cat > /etc/systemd/system/letsgo.service <<UNIT
[Unit]
Description=Let's Go!
After=network-online.target
Wants=network-online.target

[Service]
User=letsgo
WorkingDirectory=/srv/letsgo/app
EnvironmentFile=/etc/letsgo.env
ExecStartPre=-/usr/bin/git pull --ff-only
ExecStart=/usr/local/bin/node server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now letsgo
USERDATA
inst="$(aws ec2 run-instances --image-id "$ami" --instance-type t4g.micro --subnet-id "$subnet" --security-group-ids "$sg" \
  --user-data "file://$userdata" --metadata-options HttpTokens=required \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=8,VolumeType=gp3,Encrypted=true}' \
  --tag-specifications "$(tagged instance)" "$(tagged volume)" --query 'Instances[0].InstanceId' --output text)"
rm -f "$userdata"
aws ec2 wait instance-running --instance-ids "$inst"

echo "3/4 Fixed address"
alloc="$(aws ec2 allocate-address --domain vpc --tag-specifications "$(tagged elastic-ip)" --query AllocationId --output text)"
aws ec2 associate-address --instance-id "$inst" --allocation-id "$alloc" >/dev/null
ip="$(eip PublicIp)"
origin="ec2-${ip//./-}.$AWS_REGION.compute.amazonaws.com"

echo "4/4 CloudFront (https)"
config="$(mktemp)"
cat > "$config" <<JSON
{
  "CallerReference": "$TAG-$(date +%s)",
  "Comment": "$TAG",
  "Enabled": true,
  "HttpVersion": "http2and3",
  "PriceClass": "PriceClass_100",
  "Origins": { "Quantity": 1, "Items": [{
    "Id": "app", "DomainName": "$origin",
    "CustomOriginConfig": { "HTTPPort": 4747, "HTTPSPort": 443, "OriginProtocolPolicy": "http-only" }
  }]},
  "DefaultCacheBehavior": {
    "TargetOriginId": "app",
    "ViewerProtocolPolicy": "redirect-to-https",
    "Compress": true,
    "AllowedMethods": { "Quantity": 7, "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"], "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] } },
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    "OriginRequestPolicyId": "216adef6-5c7f-47e4-b989-5492eafa07d3"
  }
}
JSON
domain="$(aws cloudfront create-distribution --distribution-config "file://$config" --query 'Distribution.DomainName' --output text)"
rm -f "$config"

echo
echo "URL:                https://$domain   (allow up to 15 minutes the first time)"
echo "Organizer login:    $ORGANIZER_EMAIL"
echo "Organizer password: saved in var/aws-organizer.txt"
