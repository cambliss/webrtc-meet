# Production Deployment Guide

This guide covers deploying the video meeting application to production using Docker and Docker Compose.

## Quick Start (Docker Compose)

### 1. Create `.env.production` file:

```bash
# Database
DB_PASSWORD=your-secure-password-here
DB_NAME=video_meeting

# Service Authentication
SERVICE_AUTH_SIGNING_SECRET=your-long-random-secret-key-here
SERVICE_AUTH_MODE=production

# Optional: S3/Object Storage
OBJECT_STORAGE_TYPE=s3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
S3_BUCKET=your-bucket-name
```

### 2. Build and run with Docker Compose:

```bash
# Load environment variables
export $(cat .env.production | xargs)

# Build images
docker-compose build

# Start services
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f

# Stop services
docker-compose down
```

## Kubernetes Deployment

For Kubernetes, create `k8s/` directory with:

```
k8s/
  namespace.yaml
  configmap.yaml
  secrets.yaml
  postgres-pvc.yaml
  postgres-deployment.yaml
  web-deployment.yaml
  web-service.yaml
  signaling-deployment.yaml
  signaling-service.yaml
```

Example Web Deployment ([`k8s/web-deployment.yaml`](./docs/k8s-web-deployment.yaml)):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: video-meeting-web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: video-meeting-web
  template:
    metadata:
      labels:
        app: video-meeting-web
    spec:
      containers:
      - name: web
        image: ghcr.io/your-org/video-meeting:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: connection-string
        - name: NEXT_PUBLIC_SIGNALING_URL
          value: "https://signaling.yourdomain.com"
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 40
          periodSeconds: 10
```

## Cloud Provider Deployments

### AWS ECS

1. Create ECR repositories:
```bash
aws ecr create-repository --repository-name video-meeting-web
aws ecr create-repository --repository-name video-meeting-signaling
```

2. Push images:
```bash
docker build -t video-meeting-web .
docker tag video-meeting-web:latest {ACCOUNT_ID}.dkr.ecr.{REGION}.amazonaws.com/video-meeting-web:latest
docker push {ACCOUNT_ID}.dkr.ecr.{REGION}.amazonaws.com/video-meeting-web:latest
```

### DigitalOcean App Platform

1. Connect GitHub repository
2. Create app manifest:
```yaml
name: video-meeting
services:
- name: web
  github:
    repo: your-org/video-meeting-app
    branch: main
  build_command: npm run build
  run_command: npm start
  envs:
  - key: DATABASE_URL
    scope: RUN_AND_BUILD_TIME
    value: ${db.connection_string}
  http_port: 3000
databases:
- name: db
  engine: PG
  version: "16"
```

### Heroku

```bash
# Login
heroku login

# Create app
heroku create your-app-name

# Add PostgreSQL
heroku addons:create heroku-postgresql:standard-0

# Set environment variables
heroku config:set SERVICE_AUTH_SIGNING_SECRET=your-secret
heroku config:set SERVICE_AUTH_MODE=production

# Deploy
git push heroku main
```

## Production Checklist

- [ ] Set strong `SERVICE_AUTH_SIGNING_SECRET` (minimum 32 characters)
- [ ] Configure database backups
- [ ] Set up S3 or equivalent for object storage
- [ ] Enable HTTPS/TLS certificates
- [ ] Configure CDN for static assets
- [ ] Set up database connection pooling
- [ ] Enable database backups and point-in-time recovery
- [ ] Configure log aggregation (ELK, DataDog, etc.)
- [ ] Set up monitoring and alerting
- [ ] Configure auto-scaling policies
- [ ] Test failover and disaster recovery procedures
- [ ] Enable CORS properly for your domain
- [ ] Set up rate limiting and DDoS protection
- [ ] Document rollback procedures

## Monitoring & Logs

```bash
# View logs
docker-compose logs -f web
docker-compose logs -f signaling

# Check resource usage
docker stats

# Database backups
docker-compose exec postgres pg_dump -U postgres video_meeting > backup.sql
docker-compose exec postgres psql -U postgres video_meeting < backup.sql
```

## Troubleshooting

### Database Connection Issues
```bash
# Check database is running
docker-compose ps postgres

# Verify credentials
docker-compose exec postgres psql -U postgres -d video_meeting -c "SELECT 1;"

# Check logs
docker-compose logs postgres
```

### Port Conflicts
```bash
# Change port mappings in docker-compose.yml
# Or kill process using the port:
lsof -i :3000
kill -9 <PID>
```

### Memory Issues
```bash
# Increase Docker memory limit
# Update docker-compose.yml with resource limits:
memoryLimit: 2g
memoryReservation: 1g
```

## Security Notes

1. **Secrets Management**: Use proper secret management (AWS Secrets Manager, HashiCorp Vault, etc.)
2. **Network Security**: Use firewalls and network policies to restrict access
3. **Database**: Enable encryption at rest and in transit
4. **API Security**: Use HTTPS only, implement CORS properly, add rate limiting
5. **Container Security**: Scan images for vulnerabilities, use private registries
6. **Regular Updates**: Keep dependencies and base images updated

## Support

For deployment issues, check:
- [Docs - Hosting Requirements](../docs/hosting-requirements-and-provider-comparison.md)
- [GitHub Issues](https://github.com/your-org/video-meeting-app/issues)
- Docker logs: `docker-compose logs -f`
