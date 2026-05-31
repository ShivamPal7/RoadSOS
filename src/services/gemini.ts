import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

// Offline first-aid dictionary fallback
const OFFLINE_FIRST_AID: Record<string, string> = {
  bleeding: `🔴 **SEVER BLEEDING FIRST AID** 🔴
1. **Apply Direct Pressure**: Press a clean cloth or bandage firmly on the wound.
2. **Elevate**: Lift the bleeding limb above the heart level if possible.
3. **Keep Pressure**: Do not remove the cloth if it gets soaked; add more cloth on top.
4. **Call Emergency (108/112)** immediately if bleeding doesn't stop.
*Avoid tourniquets unless trained.*`,
  
  cpr: `🫀 **CPR INSTRUCTIONS** 🫀
1. **Check Responsiveness**: Tap shoulder and shout.
2. **Call 108/112** and request an AED.
3. **Compressions**: Push hard and fast in the center of the chest (100-120 beats/min).
   *Push at least 2 inches deep.*
4. **Rate**: Follow a 30 compressions to 2 rescue breaths cycle (or hands-only compressions).
*Use our CPR helper tool on the screen for the pacing timer.*`,

  burn: `🔥 **BURN FIRST AID** 🔥
1. **Cool the Burn**: Run cool (not cold/ice) water over the burn for 10-20 minutes.
2. **Remove Jewelry/Clothing**: Gently remove items near the burn before swelling starts.
3. **Protect**: Cover loosely with a sterile, non-stick bandage or clean plastic wrap.
4. **Do NOT**: Pop blisters, apply butter, ice, or toothpaste.
*Seek immediate medical care for deep, large, or facial burns.*`,

  choking: `🗣️ **CHOKING FIRST AID** 🗣️
1. **Ask**: "Are you choking?" Verify they cannot speak or breathe.
2. **Give 5 Back Blows**: Strike firmly between shoulder blades with the heel of your hand.
3. **Give 5 Abdominal Thrusts**: Place fist just above navel and pull inward and upward (Heimlich maneuver).
4. **Repeat** until object is expelled or victim becomes unresponsive (then begin CPR).`,

  fracture: `🦴 **FRACTURE / BONE INJURY** 🦴
1. **Stop Bleeding**: Apply pressure to any open wounds.
2. **Immobilize**: Support the injured area. Do not try to realign the bone. Apply a splint if trained.
3. **Apply Ice**: Place ice pack wrapped in a cloth to reduce swelling.
4. **Call 108/112** and do not let the victim walk if leg/spine is injured.`,

  default: `ℹ️ **FIRST AID GENERAL GUIDE** ℹ️
- **Assess Safety**: Ensure the scene is safe for you and the victim before helping.
- **Call for Help**: Tap the SOS button or dial **112 / 108** immediately.
- **Keep Calm**: Speak clearly to the patient.
- **AI Chat Offline**: Try entering keywords like **"bleeding"**, **"cpr"**, **"burn"**, **"choking"**, or **"fracture"** for specific offline guidelines.`
};

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface SeverityAnalysis {
  severity: 'minor' | 'moderate' | 'critical';
  risks: string[];
  recommendedActions: string[];
}

export const getFirstAidGuidance = async (
  query: string,
  isOnline: boolean
): Promise<string> => {
  if (!isOnline || !API_KEY) {
    // Perform keyword matching for offline fallback
    const lowercaseQuery = query.toLowerCase();
    if (lowercaseQuery.includes('bleed') || lowercaseQuery.includes('blood') || lowercaseQuery.includes('wound')) {
      return OFFLINE_FIRST_AID.bleeding;
    }
    if (lowercaseQuery.includes('cpr') || lowercaseQuery.includes('heart') || lowercaseQuery.includes('breath') || lowercaseQuery.includes('unconscious')) {
      return OFFLINE_FIRST_AID.cpr;
    }
    if (lowercaseQuery.includes('burn') || lowercaseQuery.includes('fire') || lowercaseQuery.includes('scald')) {
      return OFFLINE_FIRST_AID.burn;
    }
    if (lowercaseQuery.includes('chok') || lowercaseQuery.includes('throat') || lowercaseQuery.includes('swallow')) {
      return OFFLINE_FIRST_AID.choking;
    }
    if (lowercaseQuery.includes('fracture') || lowercaseQuery.includes('bone') || lowercaseQuery.includes('break') || lowercaseQuery.includes('joint')) {
      return OFFLINE_FIRST_AID.fracture;
    }
    return OFFLINE_FIRST_AID.default;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Provide quick, emergency first-aid instruction for this scenario: "${query}". Keep it short, structured, bulleted, and focus on immediate action. End with safety advice to call 108/112.`
                }
              ]
            }
          ],
          systemInstruction: {
            parts: [
              {
                text: "You are RoadSOS First Aid Assistant. You provide clear, step-by-step first-aid instructions for bystanders at road accident scenes. Keep formatting readable on mobile screens with markdown. Do NOT write conversational filler. Always prioritize immediate victim safety."
              }
            ]
          }
        })
      }
    );

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return replyText || 'Could not fetch guidelines. Please call 108/112 immediately.';
  } catch (error) {
    console.error('Gemini API Error, falling back to offline content:', error);
    return OFFLINE_FIRST_AID.default;
  }
};

export const analyzeAccidentPhoto = async (
  base64Image: string
): Promise<SeverityAnalysis> => {
  if (!API_KEY) {
    // Mock local analysis response if API key is missing
    return {
      severity: 'moderate',
      risks: ['Vehicle front-end impact detected', 'Potential fluid leak'],
      recommendedActions: ['Disconnect battery if possible', 'Keep distance, call towing']
    };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Image
                  }
                },
                {
                  text: 'Analyze this accident photo. Estimate the impact severity: "minor", "moderate", or "critical". Identify key risks (e.g. fire, fuel spill, traffic danger) and recommend immediate bystander safety actions. Return results strictly as a JSON object with this shape: { "severity": "minor"|"moderate"|"critical", "risks": ["risk 1", "risk 2"], "recommendedActions": ["action 1", "action 2"] }.'
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const data = await response.json();
    const jsonString = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (jsonString) {
      return JSON.parse(jsonString) as SeverityAnalysis;
    }
    throw new Error('Empty response from Gemini Vision');
  } catch (error) {
    console.error('Error analyzing image with Gemini:', error);
    // Safe default fallback
    return {
      severity: 'moderate',
      risks: ['Undetermined risks due to connectivity issues'],
      recommendedActions: ['Secure the perimeter', 'Check passengers for responsiveness', 'Call 112 / 108']
    };
  }
};
