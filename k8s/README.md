# Kubernetes Deployment Guide for Meetflow

This directory contains Kubernetes manifests for deploying the Meetflow video conferencing platform on a Kubernetes cluster.

## Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured to access your cluster
- Docker image `meetflow:latest` available to your cluster
- NGINX Ingress Controller installed
- Optional: cert-manager for TLS (Let's Encrypt)
- PostgreSQL accessible or use the provided StatefulSet

## Deployment Structure

### Core Components

1. **namespace.yaml** - Creates the `meetflow` namespace for isolation
2. **configmap.yaml** - Non-sensitive environment configuration
3. **web-deployment.yaml** - Next.js frontend (3 replicas)
4. **signaling-deployment.yaml** - Socket.IO signaling server (2 replicas)
5. **postgres-statefulset.yaml** - PostgreSQL database (1 replica)
6. **services.yaml** - ClusterIP and NodePort services
7. **ingress.yaml** - NGINX Ingress routing configuration

## Deployment Steps

### 1. Create Secrets

Before deploying, create the required secrets:

```bash
kubectl create namespace meetflow

kubectl create secret generic meetflow-secrets \
  --from-literal=database-url="postgresql://postgres:PASSWORD@postgres.meetflow.svc.cluster.local/meetflow" \
  --from-literal=deepgram-api-key="YOUR_DEEPGRAM_API_KEY" \
  --from-literal=workspace-encryption-key="YOUR_ENCRYPTION_KEY" \
  --from-literal=postgres-password="YOUR_POSTGRES_PASSWORD" \
  -n meetflow
```

### 2. Deploy PostgreSQL

```bash
kubectl apply -f k8s/postgres-statefulset.yaml
```

Wait for the pod to be ready:
```bash
kubectl wait --for=condition=ready pod -l app=postgres -n meetflow --timeout=300s
```

### 3. Deploy Services

```bash
kubectl apply -f k8s/services.yaml
```

### 4. Deploy Web and Signaling Servers

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/web-deployment.yaml
kubectl apply -f k8s/signaling-deployment.yaml
```

### 5. Configure and Deploy Ingress

Edit `k8s/ingress.yaml` to set your domain name:
```yaml
host: your-domain.com  # Change this
```

For TLS/HTTPS with cert-manager:
```yaml
annotations:
  cert-manager.io/cluster-issuer: "letsencrypt-prod"
tls:
  - hosts:
      - your-domain.com
    secretName: meetflow-tls
```

Then deploy:
```bash
kubectl apply -f k8s/ingress.yaml
```

## Verification

Check deployment status:
```bash
# Check all resources in namespace
kubectl get all -n meetflow

# Check specific deployments
kubectl get deployment -n meetflow
kubectl get statefulset -n meetflow
kubectl get pods -n meetflow

# View logs
kubectl logs -n meetflow -l app=meetflow-web
kubectl logs -n meetflow -l app=meetflow-signaling
```

## Scaling

### Scale Web Servers
```bash
kubectl scale deployment meetflow-web --replicas=5 -n meetflow
```

### Scale Signaling Servers
```bash
kubectl scale deployment meetflow-signaling --replicas=3 -n meetflow
```

## Environment Configuration

Edit `configmap.yaml` to customize:
- `NODE_ENV`: production/development
- `LOG_LEVEL`: debug/info/warning
- `RECORDING_GPU_ENCODER`: h264_nvenc/h264_vaapi/h264_videotoolbox (auto-detect by default)

## GPU Support for Recording

For GPU-accelerated recording, ensure the node has:
- NVIDIA GPU drivers (for h264_nvenc)
- FFmpeg compiled with GPU support

Set the GPU encoder in configmap.yaml:
```yaml
RECORDING_GPU_ENCODER: "h264_nvenc"  # or h264_vaapi, h264_videotoolbox
```

## Persistent Storage

The signaling server stores recordings in an EmptyDir volume. For production:

1. Replace `emptyDir` with persistent storage in `signaling-deployment.yaml`:
```yaml
volumes:
  - name: recordings
    persistentVolumeClaim:
      claimName: recordings-pvc
```

2. Create a PersistentVolumeClaim:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: recordings-pvc
  namespace: meetflow
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: efs  # or your storage class
  resources:
    requests:
      storage: 500Gi
```

## Database Migrations

If using an external PostgreSQL database, run migrations:
```bash
kubectl run -it --rm meetflow-migrations \
  --image=meetflow:latest \
  --restart=Never \
  -n meetflow \
  -e DATABASE_URL="your-database-url" \
  -- npm run migrate
```

## High Availability

### Current Configuration
- Web: 3 replicas with pod anti-affinity
- Signaling: 2 replicas with pod anti-affinity
- Database: 1 replica (single point of failure)

### For HA Database
Use a managed PostgreSQL service (AWS RDS, Azure Database, Google Cloud SQL) or deploy with Patroni for automated failover.

### Network Policies
Add network policies to restrict traffic between namespaces:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: meetflow-network-policy
  namespace: meetflow
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: meetflow
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
```

## Troubleshooting

### Port Already in Use
If port 30001 is taken, change in `services.yaml`:
```yaml
nodePort: 30002  # Choose available port
```

### ImagePullBackOff
Ensure Docker image is available:
```bash
# Push image to registry
docker tag meetflow:latest your-registry/meetflow:latest
docker push your-registry/meetflow:latest

# Update image in deployments
kubectl set image deployment/meetflow-web \
  web=your-registry/meetflow:latest -n meetflow
```

### Database Connection Issues
```bash
# Test DB connectivity from within cluster
kubectl run -it --rm postgres-test \
  --image=postgres:16-alpine \
  --restart=Never \
  -n meetflow \
  -- psql -h postgres.meetflow.svc.cluster.local -U postgres -d meetflow
```

### WebSocket Connection Fails
Check NGINX Ingress configuration:
```bash
kubectl get configmap -n ingress-nginx
kubectl describe configmap nginx-configuration -n ingress-nginx
```

Ensure WebSocket settings are configured:
```yaml
proxy-read-timeout: "3600"
proxy-send-timeout: "3600"
map_hash_bucket_size: "128"
```

## Cleanup

Remove all Meetflow resources:
```bash
kubectl delete namespace meetflow
```

## Production Checklist

- [ ] Use managed PostgreSQL (RDS, Azure, Google Cloud)
- [ ] Configure PersistentVolumes for recordings
- [ ] Set up TLS/HTTPS with cert-manager
- [ ] Configure Pod Disruption Budgets
- [ ] Set up monitoring (Prometheus + Grafana)
- [ ] Configure logging (ELK, Loki, Datadog)
- [ ] Set up backup strategy for database
- [ ] Enable Horizontal Pod Autoscaling (HPA)
- [ ] Configure Resource Quotas and Limits
- [ ] Set up Network Policies
- [ ] Enable Pod Security Policies

## HPA Configuration Example

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: meetflow-web-hpa
  namespace: meetflow
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: meetflow-web
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```
