const admin = require('firebase-admin');
require('dotenv').config();

let serviceAccount;

try {
    // 1. Try loading from GOOGLE_SERVICE_ACCOUNT_JSON (JSON string)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    }
    // 2. Check for individual variables (Fallback for some hosting environments)
    else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        serviceAccount = {
            project_id: process.env.FIREBASE_PROJECT_ID,
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle escaped newlines
        };
    }
} catch (error) {
    console.error("❌ Failed to parse Firebase credentials from environment variables:", error.message);
}

if (!serviceAccount) {
    console.error("❌ FATAL ERROR: Firebase credentials missing.");
    console.error("Please set GOOGLE_SERVICE_ACCOUNT_JSON in your .env or environment variables.");
    console.error("It should contain the full contents of your service-account.json file.");
    // We do not exit process here immediately to allow other parts of app to load if they don't depend on firebase immediately, 
    // but typically this is fatal for a firebase-heavy app. 
    // The user asked to "fail gracefully with a clear error message". 
    // I will let it proceed but admin.initializeApp won't run, likely causing errors downstream if used.
    // However, sticking to "fail gracefully" usually implies catching the error and logging it, not necessarily crashing immediately unless strictly required.
    // But for a backend, if auth depends on it, it's better to know early.
} else {
    if (!admin.apps.length) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log(`🔥 Firebase Admin Initialized with Project ID: ${serviceAccount.project_id}`);
        } catch (error) {
            console.error("❌ Firebase Admin Initialization Error:", error);
            process.exit(1); // Exit if credentials are invalid
        }
    }
}

module.exports = admin;
