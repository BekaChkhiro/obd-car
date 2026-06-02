import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/src/theme/colors';

type IconName = React.ComponentProps<typeof Feather>['name'];

interface IconShellProps {
  focused: boolean;
  name: IconName;
}

// Wraps each Feather icon with a top accent bar that lights up when active —
// gives a clear "selected" affordance independent of color alone.
function TabIcon({ focused, name }: IconShellProps) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 6 }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          width: 22,
          height: 2,
          borderRadius: 1,
          backgroundColor: focused ? colors.accent : 'transparent',
        }}
      />
      <Feather
        name={name}
        size={20}
        color={focused ? colors.accent : colors.textMuted}
      />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const tabBarHeight = 62 + Math.max(insets.bottom - 4, 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: 0,
          paddingBottom: Math.max(insets.bottom, 8),
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 9.5,
          fontWeight: '700',
          letterSpacing: 1.5,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarHideOnKeyboard: Platform.OS === 'android',
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: t('tabs.garage'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="home" />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('tabs.live'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="activity" />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: t('tabs.ai'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="message-circle" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="user" />,
        }}
      />
    </Tabs>
  );
}
