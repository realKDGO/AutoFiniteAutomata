import Button from '../components/ui/Button';
import PageContainer from '../components/PageContainer';
export default function NotFoundPage() { return <PageContainer className="grid min-h-[55vh] place-items-center text-center"><div><p className="font-display text-7xl font-bold text-primary">404</p><h1 className="mt-4 font-display text-2xl font-bold">This state does not exist.</h1><p className="mt-2 text-ink-muted dark:text-ink-darkMuted">The route could not be found.</p><Button className="mt-6" to="/">Go home</Button></div></PageContainer>; }
