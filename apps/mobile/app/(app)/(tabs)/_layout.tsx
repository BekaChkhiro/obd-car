import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FloatingTabBar } from '@/src/components/FloatingTabBar';

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      // The bar is drawn by us: the default one cannot be a floating pill with
      // a destination lifted out onto its own button.
      tabBar={(props) => <FloatingTabBar {...props} />}
      // Transparent scenes so the one ambient background behind the navigator
      // shows through instead of each screen painting its own ground.
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        // The bar owns the chat composer, so hiding it with the keyboard
        // would hide the field being typed into. It lifts itself instead.
        tabBarHideOnKeyboard: false,
      }}
    >
      <Tabs.Screen name="(home)" options={{ title: t('tabs.garage') }} />
      <Tabs.Screen name="dashboard" options={{ title: t('tabs.live') }} />
      <Tabs.Screen name="ai" options={{ title: t('tabs.ai') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
