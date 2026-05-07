require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const axios = require('axios');

async function main() {
  const filePath = path.resolve('video', 'gestao-profissional-de-quadras-esportivas.mp4');
  const payload = {
    number: process.env.PHONE,
    mediatype: 'video',
    mimetype: mime.lookup(filePath) || 'video/mp4',
    caption: 'teste-video-contrato',
    media: fs.readFileSync(filePath).toString('base64'),
    fileName: path.basename(filePath),
  };

  const response = await axios.post(
    `${process.env.EVOLUTION_API_URL}/message/sendMedia/${encodeURIComponent(process.env.EVOLUTION_INSTANCE_NAME)}`,
    payload,
    { headers: { apikey: process.env.EVOLUTION_API_KEY } },
  );

  console.log(
    JSON.stringify({
      status: response.status,
      key: response.data?.key,
      messageType: Object.keys(response.data?.message || {})[0] || null,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    }),
  );
  process.exit(1);
});