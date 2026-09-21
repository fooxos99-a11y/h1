import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import './gamePresenterLink.css';

const GamePresenterLink = ({ url, error = '' }) => {
  const [qrSrc, setQrSrc] = useState('');
  const [qrError, setQrError] = useState('');

  useEffect(() => {
    let active = true;
    setQrSrc('');
    setQrError('');
    if (!url) return () => { active = false; };

    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 360,
      color: { dark: '#07111f', light: '#ffffff' },
    }).then((dataUrl) => {
      if (active) setQrSrc(dataUrl);
    }).catch(() => {
      if (active) setQrError('تعذر إنشاء الباركود. أعد تحميل الصفحة.');
    });

    return () => { active = false; };
  }, [url]);

  return (
    <div className="game-presenter-link-card">
      <p>امسح الباركود بالجوال لفتح لوحة المقدم</p>
      <div className="game-presenter-qr-frame" aria-live="polite">
        {qrSrc ? (
          <a href={url} target="_blank" rel="noreferrer" aria-label="فتح لوحة المقدم">
            <img src={qrSrc} alt="باركود فتح لوحة المقدم" />
          </a>
        ) : (
          <div className="game-presenter-qr-loading">جاري تجهيز الباركود…</div>
        )}
      </div>
      {error || qrError ? <span>{error || qrError}</span> : null}
    </div>
  );
};

export default GamePresenterLink;
