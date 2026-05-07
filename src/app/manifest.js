export default function manifest() {
  return {
    name: 'System Zamówień B2B',
    short_name: 'Obiady B2B',
    description: 'Aplikacja do zamawiania posiłków w pracy',
    start_url: '/',
    display: 'standalone', // To polecenie ukrywa pasek przeglądarki!
    background_color: '#f1f5f9',
    theme_color: '#2563eb', // Niebieski kolor aplikacji
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}