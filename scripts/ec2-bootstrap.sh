#!/usr/bin/env bash
set -euo pipefail

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This bootstrap script currently supports Ubuntu/Debian hosts (apt-get required)."
  exit 1
fi

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run this script as a non-root user with sudo access."
  exit 1
fi

echo "[1/6] Installing base packages..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release git jq ufw

echo "[2/6] Installing Docker Engine and Compose plugin..."
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt-get update
if apt-cache policy docker-ce | grep -q "Candidate: (none)"; then
  echo "docker-ce not available for this distro/repo combo. Falling back to distro packages..."
  sudo apt-get install -y docker.io docker-compose-v2
else
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker "$USER"

echo "[3/6] Configuring UFW firewall rules..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3478/udp
sudo ufw allow 40000:49999/udp
sudo ufw --force enable

echo "[4/6] Creating app directory..."
sudo mkdir -p /opt/video-meeting-app
sudo chown -R "$USER":"$USER" /opt/video-meeting-app

echo "[5/6] Docker version check..."
docker --version
docker compose version

echo "[6/6] Bootstrap complete."
echo "Important: log out and back in once so docker group membership takes effect."
echo "Then run scripts/ec2-deploy.sh on the instance."
