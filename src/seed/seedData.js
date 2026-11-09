/**
 * Seed script — run with:  npm run seed
 * Creates / updates admin user + 3 sample campaigns.
 * Safe to re-run — uses upsert, won't duplicate.
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { User }     from '../models/User.js';
import { Campaign } from '../models/Campaign.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/onekindact';

const adminUser = {
  name:     'Jacy',
  email:    'jacy@gmail.com',
  password: 'Admin@1234',
  role:     'admin',
};

const adminUser2 = {
  name:     'OneKindAct',
  email:    'onekindact@gmail.com',
  password: 'Admin@1234',
  role:     'admin',
};

const sampleCampaigns = [
  {
    title:       'Emergency Surgery for Ahmed — Liver Failure',
    category:    'Medical Aid',
    summary:     'Ahmed, a 34-year-old father of three, needs urgent liver surgery after a sudden diagnosis. Without intervention in the next two weeks, doctors say his chances are critical.',
    story:       'Ahmed Al-Rashid was the backbone of his family — a carpenter who worked long hours to keep his children in school. Three months ago he collapsed at work and was rushed to hospital where doctors discovered acute liver failure.\n\nHis family has spent everything they had on initial treatment and consultations. The surgery alone costs $8,000 — an impossible sum for his family alone.\n\nEvery dollar donated goes directly to the hospital fund in Ahmed\'s name. We will post photographic proof of the surgery date and recovery.',
    targetAmount: 8000,
    raisedAmount: 3200,
    donorsCount:  41,
    beneficiary:  { name: 'Ahmed Al-Rashid', age: 34, location: 'Cairo, Egypt', situation: 'Father of 3, urgent liver surgery required within 2 weeks.' },
    status:       'urgent',
    isUrgent:     true,
    isFeatured:   true,
    images: [{ url: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?q=80&w=800&auto=format&fit=crop', public_id: '', isCover: true }],
  },
  {
    title:       'Winter Warmth for Displaced Families in Northern Syria',
    category:    'Emergency Relief',
    summary:     'Over 40 families living in makeshift shelters face another brutal winter without proper clothing, blankets, or heating fuel. Help us reach them before the first snowfall.',
    story:       'Each winter, temperatures in Northern Syria\'s Idlib region plunge below freezing. Thousands of displaced families who fled the conflict years ago still live in tents and uninsulated shelters.\n\nThis campaign targets 40 of the most vulnerable families — those with infants, elderly members, or sick individuals. Funds will purchase thermal blankets, winter clothing packages, and fuel vouchers.\n\nOur local partner team documents every distribution with photos and receipts. You will see exactly where your donation went.',
    targetAmount: 4500,
    raisedAmount: 1890,
    donorsCount:  27,
    beneficiary:  { name: 'Multiple Families', location: 'Idlib, Syria', situation: '40+ displaced families facing winter without heating or adequate clothing.' },
    status:       'active',
    isUrgent:     false,
    isFeatured:   true,
    images: [{ url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?q=80&w=800&auto=format&fit=crop', public_id: '', isCover: true }],
  },
  {
    title:       'School Supplies for 60 Children in Rural Kenya',
    category:    'Children & Education',
    summary:     'Sixty children in a rural Kenyan village have been attending school without basic supplies for a full year. Help us give them notebooks, pens, and dignity.',
    story:       'The Nakuru Hills Primary School serves 60 children aged 6–14 from subsistence farming families. The nearest town is a 3-hour walk away, and school fees alone stretch families to their limit.\n\nThese children show up every day without notebooks, pens, or textbooks. Their dedication is extraordinary — their resources are not.\n\nThis campaign will purchase a full year\'s worth of supplies for every child: exercise books, pens, pencils, geometry sets, and primary school readers. We will photograph the distribution day and share it with every donor.',
    targetAmount: 1800,
    raisedAmount: 620,
    donorsCount:  14,
    beneficiary:  { name: 'Nakuru Hills Primary School', location: 'Nakuru County, Kenya', situation: '60 children attending school without basic supplies.' },
    status:       'active',
    isFeatured:   true,
    images: [{ url: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=800&auto=format&fit=crop', public_id: '', isCover: true }],
  },
  {
    title:       'Wheelchair for Fatima — Restoring Her Independence',
    category:    'Disability Support',
    summary:     'Fatima lost mobility after an accident two years ago. A customised wheelchair will let her leave her room, attend school, and live with dignity.',
    story:       'Fatima is 16 years old and has been confined to her bed for two years after a road accident left her with a spinal injury. Her family cannot afford the specialised wheelchair her physiotherapist has prescribed.\n\nWith a wheelchair, Fatima can attend school again, visit friends, and reclaim her independence. The total cost including delivery and physiotherapy assessment is $1,200.',
    targetAmount: 1200,
    raisedAmount: 480,
    donorsCount:  19,
    beneficiary:  { name: 'Fatima Hassan', age: 16, location: 'Amman, Jordan', situation: 'Spinal injury — requires customised wheelchair to regain mobility.' },
    status:       'active',
    isFeatured:   true,
    images: [{ url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=800&auto=format&fit=crop', public_id: '', isCover: true }],
  },
  {
    title:       'Clean Water Well for Kibera Community',
    category:    'Community Projects',
    summary:     'Kibera families walk 4 km daily for unsafe water. A borehole well will give 300 people access to clean water 365 days a year.',
    story:       'In Kibera, Nairobi\'s largest informal settlement, clean water is a daily struggle. Women and children walk up to 4 kilometres to fetch water that is often contaminated.\n\nThis campaign funds a community borehole well with a hand pump, serving an estimated 300 people. Construction will be handled by a certified local contractor with the community owning and maintaining it long-term.',
    targetAmount: 6000,
    raisedAmount: 2100,
    donorsCount:  63,
    beneficiary:  { name: 'Kibera Community Group', location: 'Nairobi, Kenya', situation: '300+ residents lacking access to safe drinking water.' },
    status:       'active',
    isFeatured:   false,
    images: [{ url: 'https://images.unsplash.com/photo-1541544537156-7627a7a4aa1c?q=80&w=800&auto=format&fit=crop', public_id: '', isCover: true }],
  },
  {
    title:       'Food Parcels for 20 Elderly Widows This Ramadan',
    category:    'Food & Essentials',
    summary:     'Twenty elderly widows in Gaza have no family support and face Ramadan without food. Each $50 parcel feeds one woman for the entire month.',
    story:       'These 20 women are among the most forgotten in their community — elderly, alone, and without income or family to rely on. During Ramadan their need is most acute.\n\nEach food parcel costs $50 and contains rice, lentils, oil, dates, flour and sugar — enough for one month. The total needed is $1,000. Our local team will photograph every delivery and send personalised receipts to donors.',
    targetAmount: 1000,
    raisedAmount: 750,
    donorsCount:  32,
    beneficiary:  { name: '20 Elderly Widows', location: 'Gaza, Palestine', situation: 'No family support, no income — facing Ramadan without food.' },
    status:       'urgent',
    isUrgent:     true,
    isFeatured:   false,
    images: [{ url: 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?q=80&w=800&auto=format&fit=crop', public_id: '', isCover: true }],
  },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB:', MONGO_URI);

  // ── Admin user 1: jacy@gmail.com ─────────────────────────────────────────
  const existing = await User.findOne({ email: adminUser.email });
  if (existing) {
    existing.name     = adminUser.name;
    existing.password = adminUser.password;
    await existing.save();
    console.log('✅ Admin user updated:', adminUser.email);
  } else {
    await User.create(adminUser);
    console.log('✅ Admin user created:', adminUser.email);
  }
  console.log('   Email   :', adminUser.email);
  console.log('   Password:', adminUser.password);

  // ── Admin user 2: onekindact@gmail.com ───────────────────────────────────
  const existing2 = await User.findOne({ email: adminUser2.email });
  if (existing2) {
    existing2.name     = adminUser2.name;
    existing2.password = adminUser2.password;
    await existing2.save();
    console.log('✅ Admin user updated:', adminUser2.email);
  } else {
    await User.create(adminUser2);
    console.log('✅ Admin user created:', adminUser2.email);
  }
  console.log('   Email   :', adminUser2.email);
  console.log('   Password:', adminUser2.password);

  // ── Campaigns (only insert if none exist) ────────────────────────────────
  const count = await Campaign.countDocuments();
  if (count > 0) {
    console.log(`ℹ️  ${count} campaigns already exist — skipping sample campaigns.`);
    console.log('   To reset campaigns, drop the campaigns collection and re-run.');
  } else {
    await Campaign.insertMany(sampleCampaigns);
    console.log(`✅ ${sampleCampaigns.length} sample campaigns created.`);
  }

  console.log('\n🚀 Done! Start the server:');
  console.log('   cd backend && npm run dev');
  console.log('\n   Admin logins:');
  console.log('   → http://localhost:5173/admin');
  console.log('   1. Email:', adminUser.email,  '| Password:', adminUser.password);
  console.log('   2. Email:', adminUser2.email, '| Password:', adminUser2.password);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
