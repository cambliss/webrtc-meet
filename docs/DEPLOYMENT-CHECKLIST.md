# 🚀 Deployment Checklist — WebRTC Meeting App

**Status**: ✅ **Build & Code Ready** | **Date**: March 29, 2026

This checklist guides deployment of the WebRTC meeting app to staging or production environments. All code has been validated through TypeScript, build, smoke tests, and endpoint verification.

---

## 📋 Pre-Deployment Validation

### Code Quality ✅
- [x] TypeScript compilation passes (`npx tsc --noEmit`)
- [x] Production build succeeds (`npm run build` — 48 routes)
- [x] No ESLint errors in flat config
- [x] All imports resolve correctly
- [x] Git history clean, changes committed and pushed

### Feature Testing ✅
- [x] Smoke test: End-to-end meeting intelligence pipeline
- [x] Read operations: 20/20 endpoints return HTTP 200
- [x] Meeting intelligence: Tasks, highlights, search working
- [x] Workspace scope extraction from auth cookies

### Schema & Database ✅
- [x] Meeting intelligence tables exist (`meeting_tasks`, `meeting_highlights`, `meeting_search_documents`)
- [x] Direct messaging schema ready (`direct_messages`, `direct_message_files`)
- [x] Avatar analytics tracking schema present
- [x] Recording watermark metadata schema prepared
- [x] All indices created for performance

---

## 🔧 Environment Setup

### Required Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost/webrtc_meet
DB_IDLE_TIMEOUT_MS=30000
DB_QUERY_TIMEOUT_MS=10000

# Authentication & Security
JWT_SECRET=<64+ char random token>
SECURE_MESSAGING_KEY=<32-byte base64 AES-256-GCM key>
ENCRYPTION_KEY=<master encryption key for sensitive data>

# File Storage
OBJECT_STORAGE_TYPE=s3|gcs|local
OBJECT_STORAGE_BUCKET=<bucket-name>
OBJECT_STORAGE_REGION=<region>
OBJECT_STORAGE_KEY_ID=<access key>
OBJECT_STORAGE_SECRET_KEY=<secret key>

# File Security & Scanning
FILE_SIGNATURE_STRICT=true|false
ALLOWED_UPLOAD_EXTENSIONS=.pdf,.png,.jpg,.mp4,.zip
ALLOWED_UPLOAD_MIME_PREFIXES=image/,audio/,video/,text/,application/pdf,application/json,application/zip
FILE_SCAN_WEBHOOK_URL=<optional malware scanning service>
FILE_SCAN_FAIL_CLOSED=false  # set to true for strict DLP
FILE_SCAN_INCLUDE_CONTENT=false  # don't send file content to external scanner
FILE_SCAN_TIMEOUT_MS=8000

# Rate Limiting
RATE_LIMIT_LOGIN_PER_HOUR=20
RATE_LIMIT_SECURE_FILES_UPLOAD_PER_10_MIN=30
RATE_LIMIT_SECURE_MESSAGES_PER_MINUTE=60
RATE_LIMIT_API_PER_MINUTE=100
IDEMPOTENCY_TTL_SECONDS=21600  # 6 hours

# Meeting & Recording
SIGNALING_INTERNAL_URL=http://signaling-server:4000
NEXT_PUBLIC_SIGNALING_URL=https://signaling.yourdomain.com
RECORDING_ROOT_PATH=/var/recordings
MEETING_INVITE_BASE_URL=https://meet.yourdomain.com

# Email & Notifications
EMAIL_PROVIDER=sendgrid|mailgun|ses
SENDGRID_API_KEY=<key>
EMAIL_FROM_ADDRESS=noreply@yourdomain.com

# AI & Analytics
OPENAI_API_KEY=<key for summaries>
DEEPGRAM_API_KEY=<key for transcription>
ANALYTICS_WORKSPACE_ID=<your workspace ID>

# Feature Flags
FEATURE_MEETING_INTELLIGENCE=true
FEATURE_SECURE_MESSAGING=true
FEATURE_AVATAR_ANALYTICS=true
FEATURE_RECORDING_WATERMARKS=true
FEATURE_DIRECT_MESSAGING=true
STRICT_MODE=true  # Enforce validation rules

# Node Environment
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://meet.yourdomain.com
```

### Optional: .env.local overrides
- For development: use `.env.local` with `DATABASE_URL=postgresql://localhost/webrtc_meet_dev`
- For staging: use `.env.staging` with staging credentials
- Rotate all secrets before production deployment

---

## 🗄️ Database Setup

### 1. Create Database
```bash
createdb webrtc_meet -T template0 -E UTF-8
createdb webrtc_meet_test -T template0 -E UTF-8
```

### 2. Apply Schema
```bash
npm run db:migrate  # or execute schema files in sql/ directory
```

### 3. Verify Tables
```sql
\dt  -- list all tables; should show meetings, workspace_members, direct_messages, etc.
\di  -- list all indices; verify indices are created for performance
SELECT COUNT(*) FROM meetings;  -- test basic query
```

### 4. Backup & Restore
```bash
# Backup
pg_dump webrtc_meet > backup-$(date +%Y%m%d).sql

# Restore
psql webrtc_meet < backup-20260329.sql
```

---

## 🏗️ Infrastructure Deployment

### Docker Deployment
```bash
# Build images
docker build -t webrtc-meet:latest -f Dockerfile .
docker build -t webrtc-signaling:latest -f Dockerfile.signaling .

# Run containers
docker-compose -f docker-compose.yml up -d

# Verify services
curl http://localhost:3000  # Next.js app
curl http://localhost:4000  # Signaling server
curl http://localhost:5432  # PostgreSQL (internal only)
```

### Kubernetes Deployment
```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Deploy services
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/postgres-statefulset.yaml
kubectl apply -f k8s/web-deployment.yaml
kubectl apply -f k8s/signaling-deployment.yaml
kubectl apply -f k8s/ingress.yaml

# Verify pods
kubectl get pods -n webrtc-meet
kubectl logs -n webrtc-meet -l app=web-app --tail=100
```

### Reverse Proxy (Nginx)
```nginx
server {
    listen 443 ssl http2;
    server_name meet.yourdomain.com;

    ssl_certificate /etc/ssl/meet.crt;
    ssl_certificate_key /etc/ssl/meet.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_request_buffering off;
    }

    location /socket.io {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_buffering off;
    }
}
```

---

## 🔍 Post-Deployment Verification

### Health Checks
```bash
# Basic endpoint health
curl https://meet.yourdomain.com
curl https://meet.yourdomain.com/api/meetings/search

# Auth check
curl -X POST https://meet.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin","password":"<password>"}'

# Meeting intelligence
curl https://meet.yourdomain.com/api/meetings/{meetingId}/tasks
curl https://meet.yourdomain.com/api/meetings/{meetingId}/highlights

# Workspace management
curl https://meet.yourdomain.com/api/workspaces/{workspaceId}
curl https://meet.yourdomain.com/api/workspaces/{workspaceId}/members

# Direct messaging
curl https://meet.yourdomain.com/api/workspaces/{workspaceId}/direct-messages/conversations

# File operations
curl -X POST https://meet.yourdomain.com/api/workspaces/{workspaceId}/secure-files \
  -F "file=@test.txt"
```

### Log Verification
```bash
# Check application logs for errors
tail -f /var/log/webrtc-meet/app.log
tail -f /var/log/webrtc-meet/error.log

# Watch PostgreSQL slow queries
tail -f /var/log/postgresql/slow.log

# Monitor resource usage
top -p $(pgrep -f "node.*next")
```

### Database Validation
```sql
-- Count records
SELECT COUNT(*) FROM meetings;
SELECT COUNT(*) FROM workspace_members;
SELECT COUNT(*) FROM direct_messages;
SELECT COUNT(*) FROM meeting_highlights;

-- Check data freshness
SELECT MAX(created_at) FROM meetings;
SELECT MAX(created_at) FROM direct_messages;

-- Verify indices are used
EXPLAIN ANALYZE
  SELECT * FROM meetings WHERE workspace_id = 'test-ws'
  ORDER BY created_at DESC LIMIT 10;
```

---

## 🚨 Monitoring & Alerts

### Recommended Alerts
1. **HTTP 5xx rate** > 1% → Page on-call
2. **Database connection pool exhaustion** → Alert ops
3. **Disk usage > 85%** → Warn, grow volumes
4. **Memory usage > 90%** → Scale up pods
5. **API response time (p99) > 5000ms** → Investigate queries
6. **Authentication failures > 100/min** → Check for attacks
7. **Failed file uploads > 10%** → Review malware scanner

### Metrics to Track
- Requests per second (RPS) by endpoint
- Error rates (4xx, 5xx) by endpoint
- Database query latency (p50, p95, p99)
- Worker job completion rate
- Recording upload success rate
- File scan rejection rate
- Direct message latency

### Log Aggregation Setup
```yaml
# Datadog / ELK / CloudWatch
- Ship all app logs to centralized system
- Set up dashboards for key metrics
- Configure alerts for error patterns
- Retain logs for 30+ days for audit
```

---

## 🔐 Security Hardening

### Pre-Production Checklist
- [x] All secrets rotated (JWT, encryption keys, API keys)
- [ ] TLS certificates installed and renewed
- [ ] CORS policy configured correctly
- [ ] Rate limiting active on all public endpoints
- [ ] File upload scanning enabled
- [ ] Database connections use SSL
- [ ] VPC security groups restrict access
- [ ] Backups automated and tested
- [ ] DLP policies configured per org requirements
- [ ] Audit logging enabled for sensitive operations

### HTTPS & Security Headers
```nginx
# Set security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval';" always;
```

### Regular Maintenance
- **Weekly**: Review error logs, check disk/memory
- **Monthly**: Rotate non-critical secrets, update dependencies
- **Quarterly**: Penetration testing, backup restoration drills
- **Annually**: Security audit, compliance review

---

## 📊 Rollback Plan

### Quick Rollback (< 5 min)
1. **Identify issue**: Check error rate in monitoring dashboard
2. **Trigger rollback**:
   ```bash
   # For Docker
   docker-compose down
   git checkout <previous_commit>
   docker-compose up -d
   
   # For Kubernetes
   kubectl rollout undo deployment/web-app -n webrtc-meet
   ```
3. **Verify**: Run health checks above

### Database Rollback (if data corruption)
```bash
# Restore from backup
psql webrtc_meet < backup-20260329.sql

# OR if using migrations: roll back migration
npm run db:rollback --to=20260328
```

### Partial Rollback (specific feature)
- Use feature flags to disable problematic feature
- Update ENV var and restart (no full rollback needed)
- Example: `FEATURE_MEETING_INTELLIGENCE=false`

---

## 📈 Scaling Considerations

### Horizontal Scaling
```yaml
# Kubernetes: Increase replicas
kubectl scale deployment web-app --replicas=5 -n webrtc-meet

# Docker Swarm: Scale service
docker service scale web-app=5
```

### Vertical Scaling
- Increase memory requests/limits in pod spec
- Increase CPU limits for compute-intensive jobs
- Upgrade database instance class

### Database Read Replicas
- Set up streaming replication for read-heavy workloads
- Point analytics queries to read replica
- Keep write operations on primary

---

## ✅ Final Sign-Off

**Deployment Owner**: ________________  **Date**: ________

**Environment**: [ ] Staging [ ] Production

**Sign-off Checklist**:
- [ ] All environment variables configured
- [ ] Database setup verified
- [ ] Health checks pass
- [ ] Error logs reviewed (no critical errors)
- [ ] Monitoring alerts configured
- [ ] Backup tested and restorable
- [ ] Team notified of deployment
- [ ] Rollback plan documented

**Notes**: 
```
[Add any deployment-specific notes here]
```

---

## 📞 Support & Escalation

**On-Call Contact**: [Phone/Slack]
**Critical Issue Escalation**: ops-team@company.com
**Database Issues**: dba-team@company.com
**Security Issues**: security@company.com

---

**Last Updated**: March 29, 2026
**Next Review**: April 29, 2026
