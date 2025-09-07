# retwiit-service

Express microservice wrapping Rettiwt-API as a drop-in experimental replacement for twitter-service.

## Endpoints

- GET /health – service status and mode (guest/user)
- GET /api/search?q=<query>&limit=20 – search tweets
- GET /api/user/:username – user details
- GET /api/mentions?symbol=WIZI – quick hashtag mentions (count + sample)

## Env vars

- PORT (default: 8001)
- RETTIWT_API_KEY (optional; improves reliability, otherwise runs in guest mode)

## Local run

```
npm i
npm run dev
# http://localhost:8001/health
```

## Render deployment

- Create a new Web Service on Render, root set to retwiit-service/
- Build command: npm install
- Start command: npm start
- Node version: 20+
- Env vars: set RETTIWT_API_KEY if available

## Backend integration toggle

Point backend to this service by setting:

- TWITTER_SERVICE_URL = https://<your-render-retwiit-service>

Then your backend should prefer the microservice endpoints when present.

Note: This service is for testing; Rettiwt relies on Twitter web flows and may break/limit unexpectedly. See project docs: https://github.com/Rishikant181/Rettiwt-API
