# retwiit-local

Local Rettiwt microservice for testing.

Requirements: Node 22+

Setup:
```
cd retwiit-local
npm i
```

Mint API key (optional):
```
# set RETTIWT_EMAIL, RETTIWT_USERNAME, RETTIWT_PASSWORD in a local .env
npm run login
# copy output RETTIWT_API_KEY into .env
```

Run:
```
npm start
# http://localhost:8001/health
# http://localhost:8001/api/mentions?symbol=WIZI
# http://localhost:8001/api/search?q=%23WIZI&limit=10
```


