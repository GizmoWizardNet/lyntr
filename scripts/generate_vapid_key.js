#!/usr/bin/env node
/**
 * Run "node scripts/generate_vapid_key.js"
 * helper to generate VAPID keys
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('Add these to your .env you mf who can\'t generate keys manually goofy ahhh:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:mf-this-don't-exist_chanage_it_with_your_mail@1lyn.tr`);
