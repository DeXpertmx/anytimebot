require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testWebhook() {
  console.log('🧪 Testing webhook logic...\n');
  
  // Simulate webhook data from Evolution API
  const webhookData = {
    key: {
      remoteJid: '5214441234567@s.whatsapp.net',
      fromMe: false,
      id: 'test123'
    },
    message: {
      conversation: 'Hola'
    },
    pushName: 'Test User',
    instance: 'DeXpert9201'
  };
  
  console.log('📥 Simulated webhook data:');
  console.log(JSON.stringify(webhookData, null, 2));
  console.log('');
  
  // Check if fromMe
  if (webhookData.key.fromMe === true) {
    console.log('⚠️  Message is from bot (fromMe = true), should be ignored');
    return;
  }
  
  // Extract message text
  const messageText = webhookData.message?.conversation || 
                     webhookData.message?.extendedTextMessage?.text || 
                     webhookData.message?.imageMessage?.caption || 
                     '';
  
  console.log('📝 Message text:', messageText);
  console.log('📲 Instance name:', webhookData.instance);
  console.log('');
  
  // Find user by instance name
  console.log('🔍 Searching for user with instance:', webhookData.instance);
  
  const user = await prisma.user.findFirst({
    where: {
      evolutionInstanceName: webhookData.instance,
      whatsappEnabled: true,
    },
    include: {
      bots: {
        include: {
          documents: true,
        },
        take: 1,
      },
      bookingPages: {
        where: { isActive: true },
        take: 1,
      },
    },
  });
  
  if (!user) {
    console.log('❌ User NOT found!');
    console.log('');
    console.log('Checking all users with WhatsApp enabled:');
    const allUsers = await prisma.user.findMany({
      where: { whatsappEnabled: true },
      select: {
        email: true,
        username: true,
        evolutionInstanceName: true,
      },
    });
    console.log(JSON.stringify(allUsers, null, 2));
    return;
  }
  
  console.log('✅ User found!');
  console.log('   Email:', user.email);
  console.log('   Username:', user.username);
  console.log('   Evolution URL:', user.evolutionApiUrl);
  console.log('   Evolution API Key:', user.evolutionApiKey ? '✅ Set' : '❌ Not set');
  console.log('   Bot configured:', user.bots.length > 0 ? '✅ Yes' : '❌ No');
  
  if (user.bots.length > 0) {
    console.log('   Bot name:', user.bots[0].name);
    console.log('   Bot documents:', user.bots[0].documents.length);
  }
  
  console.log('');
  console.log('✅ Webhook should work correctly!');
}

testWebhook()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌ Error:', e);
    prisma.$disconnect();
    process.exit(1);
  });
