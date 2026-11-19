# Deploy templates

All templates run the same image (`ghcr.io/yakupemreyerli/coinio`) with one volume (`/data`) and port 8080.

- **Docker Compose:** the `docker-compose.yml` in the repository root.
- **Unraid:** copy `unraid/coinio.xml` to `/boot/config/plugins/dockerMan/templates-user/`, then Docker › Add Container › pick it.
- **CasaOS:** App Store › Custom Install › Import, paste `casaos/docker-compose.yml`.
- **Portainer:** Settings › App Templates › URL, point it at the raw `portainer/template.json`.
