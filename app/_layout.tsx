import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '../constants/tokens';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });

  const [session, setSession] = useState<any>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const isDemo = await AsyncStorage.getItem('eloquence:demo_mode');
      setSession(session);
      setAuthInitialized(true);
      if (!session && !isDemo) {
        // Redirige vers auth si aucune session existante et pas en mode démo
        router.replace('/auth');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (!session) router.replace('/auth');
        else router.replace('/(tabs)');
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && authInitialized) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, authInitialized]);

  if (!fontsLoaded && !fontError) return null;
  if (!authInitialized) return null;

  return (
    <>
      <StatusBar style="light" backgroundColor={Colors.base} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" options={{ animation: 'fade' }} />
      </Stack>
    </>
  );
}
