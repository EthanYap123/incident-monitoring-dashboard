import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata = {
  title: 'Incident Monitor',
  description: 'Real-time health, alerting and incident log for a simulated microservice fleet.',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH}/favicon.svg` },
};

export const viewport = {
  themeColor: '#09090b',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
