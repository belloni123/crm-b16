import nodemailer from 'nodemailer';

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const mailSubject = 'Redefinição de Senha — No Front Scale';
  const mailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px 20px; background-color: #050505; border-radius: 16px; border: 1px solid rgba(159, 232, 112, 0.1); color: #ffffff; text-align: center;">
      <div style="margin-bottom: 24px;">
        <h1 style="color: #9FE870; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; font-family: 'Outfit', sans-serif;">NO FRONT SCALE</h1>
      </div>
      
      <p style="font-size: 15px; line-height: 1.6; color: #889c7d; margin-bottom: 24px; text-align: left;">
        Olá,
      </p>
      
      <p style="font-size: 15px; line-height: 1.6; color: #f2f9ed; margin-bottom: 30px; text-align: left;">
        Você solicitou a redefinição de senha para a sua conta no No Front Scale. Para criar uma nova senha, clique no botão abaixo:
      </p>
      
      <div style="margin-bottom: 36px; text-align: center;">
        <a href="${resetUrl}" style="display: inline-block; background-color: #9FE870; color: #091302; font-weight: bold; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; box-shadow: 0 0 15px rgba(159, 232, 112, 0.3); transition: all 0.2s;">
          Redefinir Senha
        </a>
      </div>
      
      <p style="font-size: 13px; line-height: 1.5; color: #889c7d; margin-bottom: 30px; text-align: left;">
        Este link expira em 1 hora. Caso não tenha solicitado a redefinição, por favor ignore este e-mail.
      </p>
      
      <div style="border-top: 1px solid rgba(159, 232, 112, 0.08); padding-top: 20px; font-size: 12px; color: #4e5c46; text-align: left; word-break: break-all;">
        Se o botão acima não funcionar, copie e cole o link a seguir no seu navegador:<br>
        <a href="${resetUrl}" style="color: #9FE870; text-decoration: underline; display: block; margin-top: 5px;">${resetUrl}</a>
      </div>
    </div>
  `;

  const mailFrom = process.env.MAIL_FROM || 'No Front Scale <noreply@nofrontscale.com.br>';

  // 1. Usar API do Resend se configurada
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: mailFrom,
          to: [email],
          subject: mailSubject,
          html: mailHtml,
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erro retornado pelo Resend API: ${errText}`);
      }

      console.log(`E-mail de redefinição enviado via Resend para ${email}`);
      return { success: true };
    } catch (err) {
      console.error('Erro ao enviar e-mail via Resend API:', err);
    }
  }

  // 2. Usar SMTP clássico se configurado
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: mailFrom,
        to: email,
        subject: mailSubject,
        html: mailHtml,
      });

      console.log(`E-mail de redefinição enviado via SMTP para ${email}`);
      return { success: true };
    } catch (err) {
      console.error('Erro ao enviar e-mail via SMTP:', err);
      throw err;
    }
  }

  // 3. Caso nenhum esteja configurado (Simulação local)
  console.log('\x1b[33m%s\x1b[0m', `[MAIL SIMULATION] Enviar e-mail para: ${email}`);
  console.log('\x1b[33m%s\x1b[0m', `Link: ${resetUrl}`);
  return { success: true, simulated: true };
}

export async function sendProjectInvitationEmail(email: string, userName: string | null, projectName: string, projectUrl: string) {
  const mailSubject = `Convite de Projeto: ${projectName} — No Front Scale`;
  const displayName = userName || email;
  const mailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px 20px; background-color: #050505; border-radius: 16px; border: 1px solid rgba(159, 232, 112, 0.1); color: #ffffff; text-align: center;">
      <div style="margin-bottom: 24px;">
        <h1 style="color: #9FE870; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; font-family: 'Outfit', sans-serif;">NO FRONT SCALE</h1>
      </div>
      
      <p style="font-size: 15px; line-height: 1.6; color: #889c7d; margin-bottom: 24px; text-align: left;">
        Olá, <strong>${displayName}</strong>,
      </p>
      
      <p style="font-size: 15px; line-height: 1.6; color: #f2f9ed; margin-bottom: 30px; text-align: left;">
        Você foi convidado(a) para colaborar no projeto comercial <strong>${projectName}</strong> no No Front Scale.
      </p>
      
      <div style="margin-bottom: 36px; text-align: center;">
        <a href="${projectUrl}" style="display: inline-block; background-color: #9FE870; color: #091302; font-weight: bold; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; box-shadow: 0 0 15px rgba(159, 232, 112, 0.3); transition: all 0.2s;">
          Acessar Projeto
        </a>
      </div>
      
      <p style="font-size: 13px; line-height: 1.5; color: #889c7d; margin-bottom: 30px; text-align: left;">
        Se você ainda não possui senha ou se é o seu primeiro acesso, clique em "Esqueci minha senha" na tela de login para gerar suas credenciais usando este e-mail.
      </p>
      
      <div style="border-top: 1px solid rgba(159, 232, 112, 0.08); padding-top: 20px; font-size: 12px; color: #4e5c46; text-align: left; word-break: break-all;">
        Se o botão acima não funcionar, copie e cole o link a seguir no seu navegador:<br>
        <a href="${projectUrl}" style="color: #9FE870; text-decoration: underline; display: block; margin-top: 5px;">${projectUrl}</a>
      </div>
    </div>
  `;

  const mailFrom = process.env.MAIL_FROM || 'No Front Scale <noreply@nofrontscale.com.br>';

  // 1. Usar API do Resend se configurada
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: mailFrom,
          to: [email],
          subject: mailSubject,
          html: mailHtml,
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erro retornado pelo Resend API: ${errText}`);
      }

      console.log(`E-mail de convite enviado via Resend para ${email}`);
      return { success: true };
    } catch (err) {
      console.error('Erro ao enviar e-mail de convite via Resend API:', err);
    }
  }

  // 2. Usar SMTP clássico se configurado
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: mailFrom,
        to: email,
        subject: mailSubject,
        html: mailHtml,
      });

      console.log(`E-mail de convite enviado via SMTP para ${email}`);
      return { success: true };
    } catch (err) {
      console.error('Erro ao enviar e-mail de convite via SMTP:', err);
      throw err;
    }
  }

  // 3. Caso nenhum esteja configurado (Simulação local)
  console.log('\x1b[33m%s\x1b[0m', `[MAIL SIMULATION] Enviar convite de projeto para: ${email}`);
  console.log('\x1b[33m%s\x1b[0m', `Link: ${projectUrl}`);
  return { success: true, simulated: true };
}
