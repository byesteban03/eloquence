import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../constants/theme';

// Simple SVG-like icons using View shapes
function HomeIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.icon, focused && styles.iconActive]}>
      <View style={[styles.dot, { backgroundColor: focused ? Colors.electric : Colors.grey400 }]} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.electric,
        tabBarInactiveTintColor: Colors.grey400,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
              <View style={[styles.iconBar, { width: 16 }]} />
              <View style={[styles.iconBar, { width: 12 }]} />
              <View style={[styles.iconBar, { width: 14 }]} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          title: 'Réunions',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
              <View style={[styles.iconCircle, { borderColor: focused ? Colors.electric : Colors.grey400 }]} />
              <View style={[styles.iconBarH, { backgroundColor: focused ? Colors.electric : Colors.grey400 }]} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="prospecting"
        options={{
          title: 'Prospection',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
              <View style={[styles.iconSearch, { borderColor: focused ? Colors.electric : Colors.grey400 }]} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Compte',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
              <View style={[styles.iconAvatar, { backgroundColor: focused ? Colors.electric : Colors.grey400 }]} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.black,
    borderTopWidth: 0,
    height: 80,
    paddingBottom: 16,
    paddingTop: 10,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  tabIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabIconActive: {},
  iconBar: {
    height: 2,
    backgroundColor: Colors.grey400,
    borderRadius: 1,
  },
  iconBarH: {
    width: 12,
    height: 1.5,
    borderRadius: 1,
  },
  iconCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  iconSearch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  iconAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  icon: {},
  iconActive: {},
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
