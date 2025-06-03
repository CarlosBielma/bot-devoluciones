const venom = require(`venom-bot`);
const nodemailer = require(`nodemailer`);
const fs = require(`fs`);
const path = require(`path`);

const sessions = {};

const transporter = nodemailer.createTransport({
  service: `gmail`,
  auth: {
    user: `fedmacdevoluciones@gmail.com`,
    pass: `uotjatzuykpdladp`
  }
});

venom
  .create({
    session: `devoluciones`,
    headless: false,
    useChrome: true,
    browserPath: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    browserArgs: [`--no-sandbox`, `--disable-setuid-sandbox`]
  })
  .then((client) => start(client))
  .catch((error) => console.error(`Error al iniciar:`, error));

function start(client) {
  client.onMessage(async (message) => {
    const user = message.from;

    if (!sessions[user]) sessions[user] = { step: 0, answers: {}, attachments: [] };

    const session = sessions[user];

    if (session.step === 0) {
      if (message.isMedia || message.type === `image`) {
        const mediaData = await client.decryptFile(message);
        const imgPath = path.join(__dirname, `ticket_${Date.now()}.jpg`);
        fs.writeFileSync(imgPath, mediaData);
        session.attachments.push({ filename: `ticket.jpg`, path: imgPath });
        session.step = 1;
        await client.sendText(user, `1️⃣ ¿El producto está sellado y la caja está en buen estado? (sí / no)`);
      } else {
        await client.sendText(user, `Este chat es únicamente para solicitudes de devolución. Si deseas hacer una solicitud, manda una foto del ticket a devolver.`);
      }
      return;
    }

    if (session.step === 1) {
      if (message.body.toLowerCase().includes(`no`)) {
        await client.sendText(user, `❌ No se autorizan devoluciones si el producto está en mal estado o con el sello abierto.

      —------CHAT TERMINADO—-------`);
        delete sessions[user];
        return;
      }
      session.step = 2;
      await client.sendText(user, `📸 Por favor, adjunta una foto del producto sellado y en buen estado.`);
      return;
    }

    if (session.step === 2 && (message.isMedia || message.type === `image`)) {
      const mediaData = await client.decryptFile(message);
      const imgPath = path.join(__dirname, `producto_${Date.now()}.jpg`);
      fs.writeFileSync(imgPath, mediaData);
      session.attachments.push({ filename: `producto.jpg`, path: imgPath });
      session.step = 3;
      await client.sendText(user, `2️⃣ ¿De qué manera se realizó el cobro? (efectivo / tarjeta)`);
      return;
    }

    if (session.step === 3) {
      session.answers.metodoPago = message.body.toLowerCase();
      if (message.body.toLowerCase().includes(`efectivo`)) {
        session.step = 6;
        await client.sendText(user, `3️⃣ Proporcióname tu nombre y el número de la unidad donde te encuentras.`);
      } else {
        session.step = 4;
        await client.sendText(user, `💳 ¿Cuál es tu terminal? (banamex / clip)`);
      }
      return;
    }

    if (session.step === 4) {
      session.answers.terminal = message.body.toLowerCase();
      if (message.body.toLowerCase().includes(`banamex`)) {
        session.step = 41;
        await client.sendText(user, `☎️ ¿Ya realizaron el procedimiento correspondiente con el banco? (sí / no)`);
      } else if (message.body.toLowerCase().includes(`clip`)) {
        session.step = 5;
        await client.sendText(user, `📸 Adjunta una foto del voucher de la compra (asegúrate que se vea completo).`);
      }
      return;
    }

    if (session.step === 41) {
      if (message.body.toLowerCase().includes(`no`)) {
        await client.sendText(user, `ℹ️ Realiza el procedimiento correspondiente con el banco. Si no conoces el procedimiento, es el siguiente:

- Marca al número que aparece en la terminal y soliciten la cancelación del cobro.
- Una vez hecho, manden nuevamente su solicitud para la activación de la devolución.

(La devolución debe hacerse el mismo día de la compra o el sistema no la permitirá)

—------CHAT TERMINADO—-------`);
        delete sessions[user];
        return;
      } else {
        session.step = 42;
        await client.sendText(user, `✏️ Escribe el folio que te dio el banco:`);
      }
      return;
    }

    if (session.step === 42) {
      session.answers.folio = message.body;
      session.step = 6;
      await client.sendText(user, `3️⃣ Proporcióname tu nombre y el número de la unidad donde te encuentras.`);
      return;
    }

    if (session.step === 5 && (message.isMedia || message.type === `image`)) {
      const mediaData = await client.decryptFile(message);
      const imgPath = path.join(__dirname, `voucher_${Date.now()}.jpg`);
      fs.writeFileSync(imgPath, mediaData);
      session.attachments.push({ filename: `voucher.jpg`, path: imgPath });
      session.step = 6;
      await client.sendText(user, `3️⃣ Proporcióname tu nombre y el número de la unidad donde te encuentras.`);
      return;
    }

    if (session.step === 6) {
      session.answers.nombreYunidad = message.body;

      const timestamp = new Date().toLocaleString();
      const correo = {
        from: `fedmacdevoluciones@gmail.com`,
        to: `fedmacdevoluciones@gmail.com`,
        subject: `Nueva solicitud de devolución`,
        text: `
🧾 NUEVA SOLICITUD DE DEVOLUCIÓN

💳 Método de pago: ${session.answers.metodoPago || `N/A`}
🏦 Terminal: ${session.answers.terminal || `N/A`}
📄 Folio (si aplica): ${session.answers.folio || `N/A`}
👤 Nombre y unidad: ${session.answers.nombreYunidad}
🕒 Fecha/Hora: ${timestamp}
        `.trim(),
        attachments: session.attachments
      };

      transporter.sendMail(correo, (error, info) => {
        if (error) {
          console.error(`❌ Error al enviar correo:`, error);
        } else {
          console.log(`✅ Correo enviado:`, info.response);
        }
      });

      await client.sendText(user, `✅ ¡Tu solicitud de devolución ha sido registrada!

Asegúrense de hacer la devolución del efectivo en su totalidad.

[RECUERDEN QUE SI ES FIN DE MES LA DEVOLUCIÓN DEBE SER REALIZADA A LA BREVEDAD, POR LO QUE SI NO SE LES ACTIVA, INSISTAN; DE LO CONTRARIO EL SISTEMA NO LES DEJARÁ REALIZARLA]

—------CHAT TERMINADO—-------`);
      delete sessions[user];
    }
  });
}