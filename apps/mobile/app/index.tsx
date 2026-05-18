import { Redirect } from 'expo-router';
import { useAuthStore } from '@/src/store/auth';

export default function IndexRedirect() {
  const user = useAuthStore((s) => s.user);
  return <Redirect href={user ? '/(app)/' : '/(auth)/sign-in'} />;
}
