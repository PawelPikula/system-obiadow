import './globals.css'

export const metadata = {
  title: 'Obiady B2B',
  description: 'System zamówień posiłków dla pracowników',
  appleWebApp: {
    capable: true, // Włącza tryb pełnoekranowy na iPhone'ach
    title: 'Obiady B2B',
    statusBarStyle: 'default',
  },
}

// Ten blok ustawia kolory i blokuje przybliżanie ekranu (jak w prawdziwej apce)
export const viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, 
}

export default function RootLayout({ children }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  )
}