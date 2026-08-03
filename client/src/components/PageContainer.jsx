export default function PageContainer({ children, className = '' }) { return <main className={`mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 ${className}`}>{children}</main>; }
