#!/usr/bin/env bash
set -euo pipefail

# Invoked by GitHub Actions with deployment files and a Docker Hub image reference.
root=$(realpath -e -- "${1:?Deployment directory required}")
staging=$(realpath -e -- "${2:?Staging directory required}")
image=${3:?Release image required}
[[ "$root" != / && "$staging" == "$root"/.incoming/* ]] || exit 1
registry_image_pattern='^docker\.io/[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9._-]*:duydinh-[a-f0-9]{40}$'
[[ "$image" =~ $registry_image_pattern ]] || exit 1
[[ -f "$root/.env" && -d "$root/data" ]] || { echo 'Prepare .env and data/ first'; exit 1; }

exec 9> "$root/.deploy.lock"
flock -w 300 9
cd "$root"

compose() {
  BOT_IMAGE="$image" docker compose --project-name duydinh-discord-bot \
    --project-directory "$root" --file "$root/docker-compose.prod.yml" "$@"
}

previous_image=''
if [[ -f .image.env ]]; then
  previous_image=$(sed -n 's/^BOT_IMAGE=//p' .image.env)
  [[ "$previous_image" =~ $registry_image_pattern || "$previous_image" =~ ^duydinh-discord-bot:[a-f0-9]{40}$ ]] || exit 1
fi
if [[ -f docker-compose.prod.yml ]]; then
  cp docker-compose.prod.yml "$staging/previous-compose.yml"
fi

changed=0
recover() {
  status=$?
  trap - EXIT
  if (( status != 0 && changed == 1 )); then
    echo 'Deployment failed. Recent bot logs:'
    compose logs --no-color --tail 50 bot || true
    if [[ -n "$previous_image" && -f "$staging/previous-compose.yml" ]]; then
      echo "Restoring previous image: $previous_image"
      cp "$staging/previous-compose.yml" docker-compose.prod.yml
      image=$previous_image
      compose up --detach --no-build --no-deps --pull never bot || true
    else
      compose stop bot || true
    fi
  fi
  exit "$status"
}
trap recover EXIT

# Use this project's Docker Hub login, leaving other projects' registry credentials
# alone. A registry/authentication failure must happen before stopping the old bot.
docker --config "$root/.docker" pull "$image"
# Check data permissions as the image's unprivileged user before stopping anything.
docker run --rm --network none \
  --mount "type=bind,src=$root/data,dst=/app/data" "$image" \
  node -e 'require("node:fs").accessSync("/app/data", require("node:fs").constants.W_OK)'

cp "$staging/docker-compose.prod.yml" docker-compose.prod.yml
changed=1
compose config --quiet
compose run --rm --no-deps --pull never bot npm run deploy-commands

# Stop only this bot before taking a consistent snapshot of its JSON files.
compose stop --timeout 30 bot
mkdir -p backups
chmod 700 backups
backup="backups/data-$(date -u +%Y%m%dT%H%M%SZ)-${image##*:}.tar.gz"
(umask 077; tar -czf "$backup" data)
compose up --detach --no-build --no-deps --pull never --force-recreate bot

ready=0
for (( attempt=0; attempt<60; attempt++ )); do
  container=$(compose ps --all --quiet bot)
  if [[ -n "$container" ]]; then
    state=$(docker inspect --format '{{.State.Running}} {{.RestartCount}}' "$container")
    [[ "$state" == 'true 0' ]] || break
    if compose logs --no-color --tail 100 bot | grep -Fq 'Bot đã đăng nhập:'; then
      ready=1
      break
    fi
  fi
  sleep 2
done
(( ready == 1 )) || { echo 'Bot did not connect to Discord within 120 seconds'; exit 1; }

printf 'BOT_IMAGE=%s\n' "$image" > .image.env.tmp
mv .image.env.tmp .image.env
echo "Deployment ready: $image; data backup: $backup"
