const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// FMCSA Web Key - you already have this
const FMCSA_WEB_KEY = 'cdc33e44d693a3a58451898d4ec9df862c65b954';

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'Carrier Verification API is running',
        timestamp: new Date().toISOString()
    });
});

// Main verification endpoint - GET method
app.get('/verify-carrier', async (req, res) => {
    try {
        const { mc_number } = req.query;
        await processVerification(mc_number, res);
    } catch (error) {
        handleVerificationError(error, req.query.mc_number, res);
    }
});

// Main verification endpoint - POST method
app.post('/verify-carrier', async (req, res) => {
    try {
        const { mc_number } = req.body;
        await processVerification(mc_number, res);
    } catch (error) {
        handleVerificationError(error, req.body.mc_number, res);
    }
});

// Shared verification logic
async function processVerification(mc_number, res) {
    // Validate MC number
    if (!mc_number) {
        return res.status(400).json({
            error: 'MC number is required',
            message: 'Please provide mc_number as parameter'
        });
    }

    // Clean MC number (remove any non-numeric characters)
    const cleanMC = mc_number.toString().replace(/\D/g, '');
    
    if (!cleanMC) {
        return res.status(400).json({
            error: 'Invalid MC number',
            message: 'MC number must contain at least one digit'
        });
    }

    console.log(`Verifying MC Number: ${cleanMC}`);
    
    // Build FMCSA API URL
    const fmcsaUrl = `https://mobile.fmcsa.dot.gov/qc/services/carriers/docket-number/${cleanMC}?webKey=${FMCSA_WEB_KEY}`;
    
    // Call FMCSA API
    const response = await fetch(fmcsaUrl);
    
    if (!response.ok) {
        throw new Error(`FMCSA API returned ${response.status}: ${response.statusText}`);
    }
    
    const fmcsaData = await response.json();
    
    // Format response for HappyRobot
    const verificationResult = {
        verified: true,
        mc_number: cleanMC,
        company_name: fmcsaData.carrier?.legalName || 'Unknown',
        dba_name: fmcsaData.carrier?.dbaName || null,
        status: fmcsaData.carrier?.carrierOperationStatus || 'Unknown',
        authority_status: fmcsaData.carrier?.commonAuthorityStatus || 'Unknown',
        safety_rating: fmcsaData.carrier?.safetyRating || 'Not Rated',
        phone: fmcsaData.carrier?.phyPhone || null,
        address: {
            street: fmcsaData.carrier?.phyStreet || null,
            city: fmcsaData.carrier?.phyCity || null,
            state: fmcsaData.carrier?.phyState || null,
            zip: fmcsaData.carrier?.phyZipcode || null
        },
        eligibility_summary: generateEligibilitySummary(fmcsaData.carrier),
        raw_data: fmcsaData // Include full response for debugging
    };
    
    res.json(verificationResult);
}

// Error handler for verification
function handleVerificationError(error, mc_number, res) {
    console.error('Verification Error:', error.message);
    
    res.status(500).json({
        verified: false,
        error: 'Verification failed',
        message: error.message,
        mc_number: mc_number
    });
}

// Helper function to determine carrier eligibility
function generateEligibilitySummary(carrier) {
    if (!carrier) return 'Carrier not found';
    
    const status = carrier.carrierOperationStatus;
    const authority = carrier.commonAuthorityStatus;
    const safety = carrier.safetyRating;
    
    if (status === 'AUTHORIZED' && authority === 'ACTIVE') {
        return `Eligible carrier with ${safety || 'no'} safety rating`;
    } else if (status !== 'AUTHORIZED') {
        return 'Not authorized for operations';
    } else if (authority !== 'ACTIVE') {
        return 'Authority status inactive';
    } else {
        return 'Verification incomplete - manual review needed';
    }
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server Error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚛 Carrier Verification API running on port ${PORT}`);
    console.log(`📍 Test endpoint: http://localhost:${PORT}/verify-carrier?mc_number=317740`);
});