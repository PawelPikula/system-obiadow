import './globals.css'
import { Toaster } from 'sonner'
import { Inter, Outfit } from 'next/font/google'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const outfit = Outfit({ 
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

export const metadata = {
  title: 'Obiady B2B',
  description: 'System zamówień posiłków dla pracowników',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Obiady B2B',
    statusBarStyle: 'default',
  },
}

export const viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }) {
  return (
    <html lang="pl" className={`${inter.variable} ${outfit.variable}`}>
      <body className="font-sans antialiased text-slate-900 bg-slate-50 selection:bg-blue-200 selection:text-blue-900">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  )
}
