import { MED, type PHC } from './data/generate';
import type { Alert } from './data/engine';

export type Lang = 'en' | 'hi';

// English strings are the keys; missing Hindi falls back to English.
const HI: Record<string, string> = {
  'Home': 'होम', 'Daily update': 'दैनिक अपडेट', 'Dashboard': 'डैशबोर्ड', 'Forecast': 'पूर्वानुमान', 'Alerts': 'अलर्ट',
  'Emergency mode': 'आपातकालीन मोड', 'Redistribution': 'पुनर्वितरण', 'Federated learning': 'फ़ेडरेटेड लर्निंग', 'Ask SwasthChain': 'स्वस्थचेन से पूछें',
  'Privacy by design': 'डिज़ाइन से गोपनीयता', 'No patient-identifiable data': 'कोई रोगी-पहचान योग्य डेटा नहीं',
  'Online': 'ऑनलाइन', 'Offline': 'ऑफ़लाइन', 'pending sync': 'सिंक बाकी', 'All synced': 'सब सिंक हो गया', 'Sign out': 'साइन आउट', 'Data as of': 'डेटा दिनांक',
  'Critical': 'गंभीर', 'Warning': 'चेतावनी', 'Watch': 'निगरानी',
  'PHCs': 'पीएचसी', 'Critical alerts': 'गंभीर अलर्ट', 'Warnings': 'चेतावनियाँ', 'Beds available': 'उपलब्ध बेड', 'Staff present': 'उपस्थित स्टाफ', 'Reporting today': 'आज रिपोर्टिंग',
  'What needs my action today?': 'आज मुझे क्या करना है?', 'Top alerts': 'प्रमुख अलर्ट', 'Nothing urgent. All clear.': 'कुछ भी ज़रूरी नहीं। सब ठीक है।',
  'Explain with Gemini': 'Gemini से समझें', 'View forecast': 'पूर्वानुमान देखें', 'Find transfer': 'ट्रांसफर खोजें',
  'Approve': 'स्वीकृत करें', 'Reject': 'अस्वीकार करें', 'Apply scenario': 'परिदृश्य लागू करें', 'Clear scenario': 'परिदृश्य हटाएँ', 'Generate with Gemini': 'Gemini से बनाएँ',
  'Submit update': 'अपडेट जमा करें', 'Sync now': 'अभी सिंक करें', 'Run training round': 'प्रशिक्षण राउंड चलाएँ', 'Reset': 'रीसेट',
  'OPD count today': 'आज की ओपीडी संख्या', 'Beds occupied': 'भरे हुए बेड', 'Staff present today': 'आज उपस्थित स्टाफ',
  'Medical Officer': 'चिकित्सा अधिकारी', 'Nurse': 'नर्स', 'Pharmacist': 'फार्मासिस्ट', 'Medicines issued today': 'आज दी गई दवाइयाँ',
  'Stock': 'स्टॉक', 'Days left': 'शेष दिन', 'Medicine': 'दवा', 'Facility': 'स्वास्थ्य केंद्र', 'Severity': 'गंभीरता',
  'Choose a demo role': 'डेमो भूमिका चुनें', 'Scenario active': 'परिदृश्य सक्रिय', 'Audit trail': 'ऑडिट ट्रेल', 'Reason': 'कारण',
  'All': 'सभी', 'Search medicine or PHC': 'दवा या पीएचसी खोजें', 'Show more': 'और दिखाएँ', 'Suggested action': 'सुझाया गया कदम', 'days': 'दिन',
  'PHC Pharmacist': 'पीएचसी फार्मासिस्ट', 'District Officer': 'जिला अधिकारी', 'State Officer': 'राज्य अधिकारी', 'National Analyst': 'राष्ट्रीय विश्लेषक',
  'Proposed transfers': 'प्रस्तावित ट्रांसफर', 'Stock-out risk map': 'स्टॉक-आउट जोखिम मानचित्र', 'Pending sync': 'सिंक बाकी', 'Synced': 'सिंक हुआ',
  'Update saved on this device': 'अपडेट इस डिवाइस पर सहेजा गया', 'Beds': 'बेड', 'Staff': 'स्टाफ', 'Low': 'कम', 'Medium': 'मध्यम', 'High': 'अधिक',
  "Submit today's daily update": 'आज का दैनिक अपडेट जमा करें', 'Ask a question about stock, alerts or transfers': 'स्टॉक, अलर्ट या ट्रांसफर के बारे में पूछें',
};

export const translate = (lang: Lang, s: string) => (lang === 'hi' ? HI[s] ?? s : s);

export function alertTitle(a: Alert, p: PHC, lang: Lang) {
  const med = MED[a.medId].name;
  if (a.kind === 'expiry')
    return lang === 'hi'
      ? `${p.name} में ${med} (लॉट ${a.batch}) की ${a.wasteQty} यूनिट ${a.expiryDays} दिन में बिना उपयोग के एक्सपायर हो जाएगी`
      : `${a.wasteQty} ${MED[a.medId].unit}s of ${med} (lot ${a.batch}) will expire unused in ${a.expiryDays} days at ${p.name}`;
  if (a.daysLeft === 0) return lang === 'hi' ? `${p.name} में ${med} का स्टॉक आज ख़त्म हो जाएगा` : `${med} runs out today at ${p.name}`;
  return lang === 'hi' ? `${p.name} में ${med} ${a.daysLeft} दिन में ख़त्म हो जाएगी` : `${med} will run out in ${a.daysLeft} days at ${p.name}`;
}
