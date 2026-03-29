# AWS EC2 Deployment Guide

This guide deploys the app on a single Ubuntu EC2 host using Docker Compose.

## 1. Create AWS infrastructure

1. Create an EC2 instance (Ubuntu 22.04 LTS recommended):
- Instance type: t3.large minimum (better: t3.xlarge for heavier meetings)
- Storage: at least 60 GB gp3
- Public IP: enabled

2. Create a security group with these inbound rules:
- TCP 22 from your admin IP only
- TCP 80 from 0.0.0.0/0
- TCP 443 from 0.0.0.0/0
- UDP 3478 from 0.0.0.0/0 (TURN/STUN if used)
- UDP 40000-49999 from 0.0.0.0/0 (media transport)

3. Attach an IAM role if using S3:
- Policy scope must allow S3 read/write for the configured bucket.

## 2. Point DNS to EC2

1. Create A records:
- meet.yourdomain.com -> EC2 public IP
- signaling.yourdomain.com -> EC2 public IP (optional if proxied under same domain)

2. Keep TTL low (60-300s) during initial rollout.

## 3. Bootstrap the instance

SSH in:

```bash
ssh -i /path/to/key.pem ubuntu@<EC2_PUBLIC_IP>
```

Run bootstrap:

```bash
cd /tmp
curl -fsSL https://raw.githubusercontent.com/cambliss/webrtc-meet/master/scripts/ec2-bootstrap.sh -o ec2-bootstrap.sh
chmod +x ec2-bootstrap.sh
./ec2-bootstrap.sh
```

Log out and back in once after bootstrap so Docker group membership applies.

## 4. Prepare production environment file

On EC2:

```bash
mkdir -p /opt/video-meeting-app
cd /opt/video-meeting-app
```

Create `/opt/video-meeting-app/.env.production.local` with production values.
Start from `.env.production.example` once the repo is cloned.

Minimum required values:

```env
NODE_ENV=production
DB_PASSWORD=<strong password>
DB_NAME=video_meeting
DATABASE_URL=postgres://postgres:<strong password>@postgres:5432/video_meeting
NEXT_PUBLIC_APP_URL=https://meet.yourdomain.com
NEXT_PUBLIC_SIGNALING_URL=https://meet.yourdomain.com/socket.io
SIGNALING_INTERNAL_URL=http://signaling:4000
SERVICE_AUTH_SIGNING_SECRET=<openssl rand -base64 32>
SESSION_SECRET=<openssl rand -base64 32>
```

If using S3:

```env
OBJECT_STORAGE_TYPE=s3
AWS_REGION=us-east-1
S3_BUCKET=<bucket>
AWS_ACCESS_KEY_ID=<key or use IAM role>
AWS_SECRET_ACCESS_KEY=<secret or use IAM role>
```

## 5. Deploy the application

```bash
cd /tmp
curl -fsSL https://raw.githubusercontent.com/cambliss/webrtc-meet/master/scripts/ec2-deploy.sh -o ec2-deploy.sh
chmod +x ec2-deploy.sh

# First deploy: apply schema
APP_DIR=/opt/video-meeting-app \
ENV_FILE=/opt/video-meeting-app/.env.production.local \
BRANCH=master \
APPLY_SCHEMA=true \
./ec2-deploy.sh
```

For subsequent updates:

```bash
APP_DIR=/opt/video-meeting-app \
ENV_FILE=/opt/video-meeting-app/.env.production.local \
BRANCH=master \
APPLY_SCHEMA=false \
./ec2-deploy.sh
```

## 6. Add HTTPS reverse proxy (required)

Install Nginx and Certbot:

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Use this Nginx site config:

```nginx
server {
    listen 80;
    server_name meet.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Enable HTTPS certificate:

```bash
sudo certbot --nginx -d meet.yourdomain.com
```

## 7. Verify deployment

From EC2:

```bash
curl -I http://localhost:3000
curl -I http://localhost:4000/health
docker ps
```

From your machine:

```bash
curl -I https://meet.yourdomain.com
```

## 8. Operate and update

View logs:

```bash
cd /opt/video-meeting-app
docker compose --env-file .env.production.local logs -f web signaling postgres
```

Deploy latest master:

```bash
cd /tmp
APP_DIR=/opt/video-meeting-app \
ENV_FILE=/opt/video-meeting-app/.env.production.local \
BRANCH=master \
APPLY_SCHEMA=false \
./ec2-deploy.sh
```

## 9. Rollback

Rollback to previous commit:

```bash
cd /opt/video-meeting-app
git log --oneline -n 5
git checkout <previous_commit>
docker compose --env-file .env.production.local build
docker compose --env-file .env.production.local up -d --remove-orphans
```

## Notes

- For production scale, move PostgreSQL off-instance to AWS RDS.
- Keep media UDP range open and monitor egress costs.
- Restrict SSH to known admin IPs only.
