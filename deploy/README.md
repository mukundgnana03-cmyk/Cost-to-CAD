# Existing cloud server

This configuration serves the actual CAD upload/analysis interface at `https://YOUR_DOMAIN`. Caddy provides HTTPS and a login in front of every UI/API route. Gemini is not needed. OpenAI interpretation is optional; local commands, STEP measurements and Blender renders work without an AI key.

Prerequisites: Linux server, Docker Engine + Compose, a DNS record pointing your app domain to that server, and inbound ports 80/443 available. The backend stays on the private Docker network. Base Compose's port 8080 remains loopback-only for server-local diagnostics.

1. Transfer this project to the server with the authorized deployment account. Do not replace an existing application's directory or configuration. Do not transfer development `data`, `.env`, caches or `.venv` unless explicitly migrating them.
2. In the project directory create an ignored `.env`. Set `CAD_DOMAIN` to the domain (without scheme or path), and `CAD_AUTH_USER` to your chosen login.
3. Generate the login password hash on the server using `docker run --rm -it caddy:2.10-alpine caddy hash-password`. Enter the password at its interactive prompt. Put the resulting hash in `.env` as `CAD_AUTH_HASH='...hash...'` using single quotes, which keep Compose from expanding dollar signs inside bcrypt hashes. Do not share passwords in chat.
4. Optionally set `CAD_AI_API_KEY` and `CAD_AI_MODEL=gpt-6` in the server's secret environment/ignored `.env`. Your OpenAI account must support the chosen model. This application's API requests are independent of the chat session and its subscription. There is no automatic credential connection or verified GPT-6 availability. Set another account-supported model ID if needed.
5. Start:

```sh
docker compose -f compose.yaml -f deploy/compose.cloud.yaml up --build -d --wait --wait-timeout 240
```

6. Open `https://YOUR_DOMAIN`, sign in, choose **Browse files**, upload a STEP/STP model, then click **Analyze model**. CATPart/CATProduct still require the licensed native adapter described in the root README.

The cloud override is a separate deployment target. It has not been run against your server until its address and deployment access are supplied and verified. It does not change DNS or publish this workspace. Back up the `cad-data` named volume before updates. Stop without deleting data using the same Compose file arguments followed by `down` (omit `--volumes`).
