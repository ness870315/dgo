import React, { useEffect, useState } from 'react';

const FuelSharingPage = ({ fuelType, symbol }) => {
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    // Generate the fuel image URL
    const apiBase = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
    setImageUrl(`${apiBase}/api/fuel-image/${fuelType}/${symbol}`);
    
    // Redirect to main site after 2 seconds
    const timer = setTimeout(() => {
      window.location.href = 'https://degen-oracle.com';
    }, 2000);

    return () => clearTimeout(timer);
  }, [fuelType, symbol]);

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      margin: 0,
      padding: '20px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.9)',
        borderRadius: '20px',
        padding: '40px',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
        maxWidth: '600px',
        color: '#333'
      }}>
        <h1 style={{ color: '#333', marginBottom: '10px' }}>
          🔥 {symbol} {fuelType} Fuel
        </h1>
        <p style={{ color: '#666', fontSize: '18px', marginBottom: '30px' }}>
          Someone just fueled #{symbol} with {fuelType} boost on Degen Oracle!
        </p>
        {imageUrl && (
          <img 
            src={imageUrl} 
            alt={`${symbol} ${fuelType} Fuel`}
            style={{
              maxWidth: '100%',
              height: 'auto',
              borderRadius: '15px',
              margin: '20px 0'
            }}
            onError={(e) => e.target.style.display = 'none'}
          />
        )}
        <p>The degen army is assembling! 🚀</p>
        <a 
          href="https://degen-oracle.com" 
          style={{
            background: 'linear-gradient(45deg, #ff6b6b, #ffa500)',
            color: 'white',
            padding: '15px 30px',
            border: 'none',
            borderRadius: '50px',
            fontSize: '18px',
            fontWeight: 'bold',
            textDecoration: 'none',
            display: 'inline-block',
            transition: 'transform 0.2s'
          }}
        >
          Join the Oracle
        </a>
      </div>
    </div>
  );
};

export default FuelSharingPage;
