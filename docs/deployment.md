# Deploy from GitHub to your VPS

The workflow tests the code, builds a Docker image on GitHub, pushes it to Docker
Hub, and tells the VPS over SSH to pull it and update the `duydinh-discord-bot`
Compose project. SSH transfers only the Compose file and deployment script. The
VPS does not need a Git checkout. The bot opens no inbound ports and does not
require a domain or reverse proxy.

## Prepare these details

- VPS public IP address or hostname, SSH username, and SSH port (usually 22).
- VPS OS and CPU architecture: run `cat /etc/os-release` and `uname -m`.
  `x86_64` uses `linux/amd64`; `aarch64` uses `linux/arm64`.
- Docker Engine and the Docker Compose plugin already installed. The SSH user
  must be able to run `docker info` without interactive sudo. Docker access
  grants administrative control of the host; use a dedicated deployment key.
- A GitHub repository containing this project on its `main` branch.
  GitHub-hosted runners must be able to reach the VPS SSH port.
- A Docker Hub account, image repository, and a personal access token with Read
  and Write permissions for CI. The repository defaults to
  `YOUR_DOCKERHUB_USERNAME/duydinh-discord-bot`.
- The bot token and Application ID from Discord Developer Portal. Keep these in
  the VPS `.env` file; do not put them in the repository or chat.

Use GitHub's included Actions allowance for this small pipeline. A private
repository has a monthly allowance; check your account's Actions usage/budget
and leave paid overage disabled if you want no additional CI charges.

## One-time VPS setup

This VPS uses the SSH user `root` and the project directory
`/root/bots/volam`. Run the setup commands in that directory on the VPS.

```bash
docker info >/dev/null
docker compose version
command -v bash flock realpath gzip tar

sudo install -d -m 750 -o "$(id -un)" -g "$(id -gn)" /root/bots/volam
cd /root/bots/volam
sudo install -d -m 2770 -o 1000 -g "$(id -gn)" data
test -e .env || install -m 600 /dev/null .env
nano .env
```

Enter these values in the editor, then save:

```dotenv
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
```

The container runs as UID 1000, which must be able to write `data/`. The directory's
group also gives the deployment user access to read and back up those files.
Stop the old local instance before taking the final data snapshot and deploying
this same bot token.

### Preserve an existing installation

Before the first VPS startup, copy the existing `data/configs.json` and
`data/guild-data.json` into `/root/bots/volam/data/`. The current JSON
format can be copied directly; retain server, role, channel, event, and message
IDs. Keep using the same Discord bot credentials and server installations.

Retain any supplied `guild-data.backup.json` separately as a recovery copy;
do not replace `guild-data.json` with it. The bot reads only `configs.json`
and `guild-data.json`. Runtime JSON files, including backups, are excluded from
Git and the Docker image. CI deployments preserve the VPS data directory.

After uploading the two live files, set their ownership so the container can
write them (run on the VPS from the bot directory):

```bash
sudo chown 1000:"$(id -gn)" data/configs.json data/guild-data.json
sudo chmod 640 data/configs.json data/guild-data.json
```

Do not overwrite data on an already running VPS bot with an older snapshot.
Stop the bot and back up its current data before a later restore.

Ensure Docker starts on VPS reboot (on a systemd host: `systemctl is-enabled docker`).

## Docker Hub setup

Create the image repository on Docker Hub and choose its visibility explicitly.
A private GitHub repository does not make the Docker Hub image private. Docker
Personal currently includes [one private repository](https://www.docker.com/pricing/).
If your existing project already uses that slot, you can set `DOCKERHUB_REPOSITORY`
to that existing repository: the bot uses `duydinh-FULL_COMMIT_SHA` tags to keep
its releases separate from your other app's tags. The workflow does not push a
shared `latest` tag. Use a private repository to keep the image and source inside
it private.

CI authenticates the VPS automatically using `DOCKERHUB_USERNAME` and
`DOCKERHUB_TOKEN` before pulling the image. It sends the token through SSH's
standard input and stores the login in this project's `.docker` directory with
restricted permissions. Other projects retain their existing Docker logins.

For manual troubleshooting, you can also log in **on the VPS as the deployment
user**, using a Docker Hub token with Read permission (the CI token also works):

```bash
cd /root/bots/volam
install -d -m 700 .docker
docker --config "$PWD/.docker" login --username YOUR_DOCKERHUB_USERNAME
```

Paste the token at Docker's password prompt. The deploy script uses this same
config directory when pulling. The Docker Hub token stays out of `.env`.

The [Docker Hub login documentation](https://docs.docker.com/reference/cli/docker/login/)
describes registry authentication and credential storage.

## Dedicated SSH key and host verification

On your own computer, generate a dedicated Ed25519 deployment key using
`ssh-keygen -t ed25519 -f ~/.ssh/duydinh-deploy -C github-actions-duydinh`.
Use an empty passphrase for this CI-only key. Add the **public** key
(`duydinh-deploy.pub`) to the deployment user's `~/.ssh/authorized_keys` on the
VPS. Keep the private key out of the project directory and Git history.

For example, the authorized_keys entry can start with `restrict` followed by
the public key to disable forwarding and PTY allocation while allowing this
pipeline's SSH commands and SFTP transfers.

Collect the VPS host key on your computer (replace the port and hostname):

```bash
ssh-keyscan -p 22 -t ed25519 YOUR_VPS_HOST > duydinh-known-hosts
ssh-keygen -lf duydinh-known-hosts
```

Compare that fingerprint with the one shown in a trusted VPS session/console:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Only use the scanned key if the fingerprints match. The workflow requires host
verification and will not automatically trust a new or changed server key.

## GitHub configuration

In **Settings → Environments**, create `production`. Add these environment
secrets (repository Actions secrets also work):

- `VPS_HOST`: the public IP address or hostname.
- `VPS_USER`: the SSH deployment username.
- `VPS_SSH_KEY`: the complete private deployment key, including header/footer.
- `VPS_KNOWN_HOSTS`: the verified contents of `duydinh-known-hosts`.
- `DOCKERHUB_USERNAME`: your Docker Hub login username.
- `DOCKERHUB_TOKEN`: your Docker Hub personal access token with Read and Write
  permissions. CI uses it to push the built image.

The SSH settings are still required: Docker Hub stores the image, while SSH runs
the deployment commands on the VPS. Discord credentials stay in the VPS `.env`.

Under **Settings → Secrets and variables → Actions → Variables**, optionally add:

- `VPS_PORT`: defaults to `22`.
- `VPS_DEPLOY_PATH`: defaults to `/root/bots/volam`.
- `VPS_PLATFORM`: defaults to `linux/amd64`; set `linux/arm64` for an ARM VPS.
- `DOCKERHUB_REPOSITORY`: defaults to
  `DOCKERHUB_USERNAME/duydinh-discord-bot`. Set the full `namespace/repository`
  when using an organization or sharing your existing private image repository.

Enable Actions for the repository. If the repository belongs to your
friend, they must grant you access to configure Actions/environment secrets.

## Deploy and verify

Review and push these files to `main`. Pushes to `main` deploy automatically;
pull requests run tests only. For a manual deploy, select **Actions → Test and
deploy bot → Run workflow** and choose `main`.

Every deployment pulls its commit-tagged image from Docker Hub before changing
the running bot. An authentication or pull failure leaves the old bot running.
It then registers slash commands, stops only this bot, backs up its
data, starts the new image, and waits up to 120 seconds for the existing
Discord-ready log message. A failed replacement attempts to restart the previous
successful image; the first failed deployment stops the bot. This readiness
check confirms initial Discord login, not ongoing availability or every command.

In Discord, confirm the bot is online, run `/setup`, and test registration and
attendance. Invite instructions and required channel permissions are in README.md.

On the VPS, inspect this bot using:

```bash
cd /root/bots/volam
docker compose --project-name duydinh-discord-bot --env-file .image.env -f docker-compose.prod.yml ps
docker compose --project-name duydinh-discord-bot --env-file .image.env -f docker-compose.prod.yml logs --tail 100 bot
```

`.image.env` records the last successful image. Backups stay under `backups/`;
copy them off the VPS periodically. Old images and backups are retained so you
can recover manually. Review their disk usage periodically; the workflow never
runs host-wide Docker prune commands on your shared VPS.

To roll back manually, use a previous successful workflow's commit SHA:

```bash
cd /root/bots/volam
BOT_IMAGE=docker.io/YOUR_NAMESPACE/YOUR_REPOSITORY:duydinh-PREVIOUS_FULL_COMMIT_SHA docker compose --project-name duydinh-discord-bot -f docker-compose.prod.yml up -d --no-build --pull never bot
```

After verifying the rollback, update `.image.env` to that same `BOT_IMAGE` value.
This changes the running image without restoring old attendance data. If command
definitions changed, register commands again using that image with Compose's
`run --rm --no-deps bot npm run deploy-commands`.

If that image is no longer cached on the VPS, pull it first using the project's
registry credentials:

```bash
docker --config /root/bots/volam/.docker pull docker.io/YOUR_NAMESPACE/YOUR_REPOSITORY:duydinh-PREVIOUS_FULL_COMMIT_SHA
```
