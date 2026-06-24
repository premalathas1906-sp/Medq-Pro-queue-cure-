// QR Code helper using public QR Server API with custom theme matching

export const getQrCodeUrl = (token: string): string => {
  // Construct the target URL that the QR Code will navigate to
  const targetUrl = `${window.location.protocol}//${window.location.host}/?view=patient&token=${token}`;
  const encodedData = encodeURIComponent(targetUrl);
  
  // Custom themed QR: foreground cyan (#06b6d4) and background slate (#0f172a)
  return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=06b6d4&bgcolor=0f172a&data=${encodedData}`;
};
