import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { SentinelProvider } from './context/SentinelContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/ToastContainer';
import { BlockedCommentModal } from './components/BlockedCommentModal';
import { CreatePostModal } from './components/CreatePostModal';
import { AIScannerModal } from './components/AIScannerModal';
import { AIFloatingSentinel } from './components/AIFloatingSentinel';
import { GoogleUnauthorizedDomainModal } from './components/GoogleUnauthorizedDomainModal';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { HomeFeedPage } from './pages/HomeFeedPage';
import { ExplorePage } from './pages/ExplorePage';
import { ReelsPage } from './pages/ReelsPage';
import { MessagesPage } from './pages/MessagesPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { AIDashboardPage } from './pages/AIDashboardPage';
import { AIArchitecturePreviewPage } from './pages/AIArchitecturePreviewPage';
import { SentinelAIChatbotPage } from './pages/SentinelAIChatbotPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { HelpCenterPage } from './pages/HelpCenterPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ShieldCheck, Heart } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { currentPage, setCurrentPage, isAuthenticated } = useApp();
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Keep URL clean without trailing '#'
  useEffect(() => {
    const stripHash = () => {
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search
        );
      }
    };

    stripHash();
    window.addEventListener('hashchange', stripHash);
    return () => window.removeEventListener('hashchange', stripHash);
  }, []);

  const hideSidebarPages = [
    'landing',
    'login',
    'signup',
    'verify-email',
    'about',
    'privacy',
    'terms',
    'help',
    'contact',
    'ai-architecture',
    ...(!isAuthenticated ? ['ai-dashboard', 'ai_dashboard'] : []),
  ];
  const showSidebar = !hideSidebarPages.includes(currentPage);

  const renderPage = () => {
    switch (currentPage as string) {
      case 'landing':
        return <LandingPage />;
      case 'login':
        return <LoginPage />;
      case 'signup':
        return <SignupPage />;
      case 'verify-email':
        return <VerifyEmailPage />;
      case 'home':
        return <HomeFeedPage onOpenCreatePost={() => setIsCreatePostOpen(true)} />;
      case 'explore':
        return <ExplorePage />;
      case 'reels':
        return <ReelsPage />;
      case 'messages':
        return <MessagesPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'profile':
        return <ProfilePage />;
      case 'settings':
        return <SettingsPage />;
      case 'ai-dashboard':
      case 'ai_dashboard':
        return isAuthenticated ? <AIDashboardPage /> : <AIArchitecturePreviewPage />;
      case 'ai-architecture':
        return <AIArchitecturePreviewPage />;
      case 'sentinel-ai':
      case 'sentinel_ai':
      case 'sentinel-chatbot':
        return <SentinelAIChatbotPage />;
      case 'about':
        return <AboutPage />;
      case 'contact':
        return <ContactPage />;
      case 'privacy':
        return <PrivacyPage />;
      case 'terms':
        return <TermsPage />;
      case 'help':
        return <HelpCenterPage />;
      default:
        return <NotFoundPage />;
    }
  };

  return (
    <div className="min-h-screen bg-[#050507] text-gray-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white relative overflow-x-hidden">
      {/* Background Atmospheric Glows */}
      <div className="fixed top-[-100px] left-[-100px] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-100px] right-[-100px] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* Top Fixed Navbar */}
      <Navbar
        onOpenCreatePost={() => setIsCreatePostOpen(true)}
        onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
      />

      {/* Main Body Area */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto px-4 lg:px-6 pt-16 z-10 relative gap-6">
        {/* Responsive Sidebar */}
        {showSidebar && (
          <Sidebar
            isOpenMobile={isMobileSidebarOpen}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
            onOpenCreatePost={() => setIsCreatePostOpen(true)}
          />
        )}

        {/* Dynamic Main View */}
        <main
          className={`flex-1 min-w-0 ${
            currentPage === 'messages'
              ? 'h-[calc(100vh-64px)] py-2 overflow-hidden flex flex-col'
              : 'py-6'
          }`}
        >
          {renderPage()}
        </main>
      </div>

      {/* Footer for informative pages */}
      {currentPage !== 'messages' && (
        <footer className="border-t border-white/5 bg-black/40 backdrop-blur-md py-6 px-6 text-[10px] text-gray-500 z-10 relative">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img
              src="/verixa-logo.jpg"
              alt="VERIXA Logo"
              className="w-6 h-6 rounded-lg object-cover shadow-[0_0_10px_rgba(37,99,235,0.4)] border border-purple-500/20"
            />
            <span className="font-bold text-gray-200 tracking-wider">VERIXA AI Safe Platform</span>
            <span className="text-gray-500">• End-to-End Neural Defense</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-gray-400">
            <button onClick={() => setCurrentPage('about')} className="hover:text-blue-400 transition-colors">
              About
            </button>
            <button onClick={() => setCurrentPage('ai-architecture')} className="hover:text-blue-400 transition-colors">
              AI Architecture
            </button>
            <button onClick={() => setCurrentPage('privacy')} className="hover:text-blue-400 transition-colors">
              Privacy
            </button>
            <button onClick={() => setCurrentPage('terms')} className="hover:text-blue-400 transition-colors">
              Terms
            </button>
            <button onClick={() => setCurrentPage('help')} className="hover:text-blue-400 transition-colors">
              Help Center
            </button>
            <button onClick={() => setCurrentPage('contact')} className="hover:text-blue-400 transition-colors">
              Contact
            </button>
          </div>
        </div>
      </footer>
      )}

      {/* Global Modals & Overlay Widgets */}
      <CreatePostModal isOpen={isCreatePostOpen} onClose={() => setIsCreatePostOpen(false)} />
      <AIScannerModal />
      <BlockedCommentModal />
      <AIFloatingSentinel />
      <GoogleUnauthorizedDomainModal />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <SentinelProvider>
        <MainLayout />
      </SentinelProvider>
    </AppProvider>
  );
}
