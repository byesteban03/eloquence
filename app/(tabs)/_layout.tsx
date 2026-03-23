import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, FontSize, FontWeight } from '../../constants/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <BlurView tint="dark" intensity={70} style={{ flex: 1, borderRadius: 32, overflow: 'hidden' }} />
        ),
        tabBarActiveTintColor: Colors.textPrimary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconBox}>
              <View style={[styles.iBar, { width: 16, backgroundColor: focused ? Colors.accent : Colors.textSecondary }]} />
              <View style={[styles.iBar, { width: 11, backgroundColor: focused ? Colors.accent : Colors.textSecondary }]} />
              <View style={[styles.iBar, { width: 14, backgroundColor: focused ? Colors.accent : Colors.textSecondary }]} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          title: 'Réunions',
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconBox}>
              <View style={[styles.iCircle, { borderColor: focused ? Colors.accent : Colors.textSecondary }]} />
              <View style={[styles.iBarH, { backgroundColor: focused ? Colors.accent : Colors.textSecondary }]} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="prospecting"
        options={{
          title: 'Prospects',
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconBox}>
              <View style={[styles.iSearch, { borderColor: focused ? Colors.accent : Colors.textSecondary }]} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Compte',
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconBox}>
              <View style={[styles.iAvatar, { backgroundColor: focused ? Colors.accent : Colors.textSecondary }]} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 32 : 24,
    left: 20,
    right: 20,
    height: 64,
    borderRadius: 32,
    borderTopWidth: 0,
    backgroundColor: 'rgba(22, 22, 24, 0.65)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  iconBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iBar: {
    height: 2,
    borderRadius: 1,
  },
  iBarH: {
    width: 12,
    height: 1.5,
    borderRadius: 1,
  },
  iCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  iSearch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  iAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
});
