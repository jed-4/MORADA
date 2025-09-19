import Header from '../Header';
import { ThemeProvider } from '@/contexts/ThemeContext';

export default function HeaderExample() {
  return (
    <ThemeProvider>
      <div className="w-full">
        <Header />
      </div>
    </ThemeProvider>
  );
}