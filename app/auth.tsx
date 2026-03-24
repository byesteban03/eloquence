import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../constants/tokens';
import { EloquenceLogo } from '../components/EloquenceLogo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleAuth = async () => {
    if (!email || !password || (!isLogin && !fullName)) {
      setErrorMsg('Veuillez remplir tous les champs.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data: { user }, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        // User is now signed up, trigger handle_new_user creates profile.
        // We will show Step 2 (Sector selection) after signup.
        setStep(2);
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const [step, setStep] = useState(1);
  const [secteur, setSecteur] = useState('');

  const SECTEURS = [
    { label: '🎭 Événementiel / Traiteur', value: 'evenementiel' },
    { label: '🏗️ BTP / Aménagement', value: 'btp' },
    { label: '🚗 Automobile / Leasing', value: 'auto' },
    { label: '💼 Services B2B / Conseil', value: 'services' },
    { label: '🚀 Tech / Startup', value: 'tech' },
  ];

  const handleFinishOnboarding = async () => {
    if (!secteur) {
      setErrorMsg('Veuillez choisir votre secteur d\'activité.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non trouvé');

      // 1. Update profile sector
      await supabase.from('profiles').update({ secteur }).eq('id', user.id);

      // 2. Pre-configure signals based on sector
      let signalsToEnable: string[] = ['creation_entreprise', 'anniversaire_entreprise'];
      if (secteur === 'evenementiel') {
        signalsToEnable.push('salon_professionnel', 'fusion_acquisition', 'changement_dirigeant');
      } else if (secteur === 'btp') {
        signalsToEnable.push('permis_construire', 'appel_offres_public', 'nouveau_etablissement', 'demenagement_siege');
      } else if (secteur === 'auto') {
        signalsToEnable.push('lancement_produit', 'depot_brevet');
      } else if (secteur === 'tech') {
        signalsToEnable.push('levee_fonds', 'recrutement_massif');
      }

      const { error: upsertError } = await supabase.from('types_signaux').upsert(
        signalsToEnable.map(code => ({ user_id: user.id, code, active: true })), 
        { onConflict: 'user_id,code' }
      );
      if (upsertError) throw upsertError;

      router.replace('/(tabs)');
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMode = async () => {
    await AsyncStorage.setItem('eloquence:demo_mode', 'true');
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          {step === 1 ? (
            <>
              <View style={styles.header}>
                <EloquenceLogo variant="vertical" size={56} />
                <Text style={styles.subtitle}>
                  L'assistant des commerciaux qui accélère la signature.
                </Text>
              </View>

              <View style={styles.form}>
                {!isLogin && (
                  <TextInput
                    style={styles.input}
                    placeholder="Nom complet"
                    placeholderTextColor={Colors.textTertiary}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                  />
                )}
                
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={Colors.textTertiary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                
                <TextInput
                  style={styles.input}
                  placeholder="Mot de passe"
                  placeholderTextColor={Colors.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                <TouchableOpacity 
                  style={[styles.mainBtn, loading && styles.mainBtnDisabled]} 
                  onPress={handleAuth}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.mainBtnTxt}>
                      {isLogin ? 'Se connecter' : 'Créer un compte'}
                    </Text>
                  )}
                </TouchableOpacity>

                {errorMsg && (
                  <Text style={styles.errorTxt}>{errorMsg}</Text>
                )}

                <TouchableOpacity 
                  style={styles.toggleBtn} 
                  onPress={() => {
                    setIsLogin(!isLogin);
                    setErrorMsg(null);
                  }}
                >
                  <Text style={styles.toggleBtnTxt}>
                    {isLogin 
                      ? "Pas encore de compte ? S'inscrire" 
                      : 'Déjà un compte ? Se connecter'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.dividerBox}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerTxt}>OU</Text>
                  <View style={styles.divider} />
                </View>

                <TouchableOpacity 
                  style={styles.demoBtn} 
                  onPress={handleDemoMode}
                  activeOpacity={0.8}
                >
                  <Text style={styles.demoBtnTxt}>
                    ✨ Accès Démo (Freemium)
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.onboardingBox}>
              <Text style={styles.onboardingTitle}>Bienvenue, {fullName} ! 👋</Text>
              <Text style={styles.onboardingSub}>Quel est votre principal secteur d'activité ? Nous configurerons vos signaux d'affaires en conséquence.</Text>
              
              <View style={styles.sectorPicker}>
                {SECTEURS.map(s => (
                  <TouchableOpacity
                    key={s.value}
                    style={[styles.sectorBtn, secteur === s.value && styles.sectorBtnActive]}
                    onPress={() => setSecteur(s.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sectorBtnTxt, secteur === s.value && styles.sectorBtnTxtActive]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity 
                style={[styles.mainBtn, (loading || !secteur) && styles.mainBtnDisabled]} 
                onPress={handleFinishOnboarding}
                disabled={loading || !secteur}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.mainBtnTxt}>Commencer la prospection ✨</Text>
                )}
              </TouchableOpacity>

              {errorMsg && (
                <Text style={styles.errorTxt}>{errorMsg}</Text>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.base,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  logoTxt: {
    fontFamily: 'Outfit_700Bold',
    fontSize: FontSize.xxl,
    color: '#fff',
    letterSpacing: 2,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 32,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: 'Outfit_400Regular',
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  form: {
    gap: Spacing.md,
  },
  input: {
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    color: Colors.textPrimary,
    fontFamily: 'Outfit_400Regular',
    fontSize: FontSize.md,
  },
  mainBtn: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  mainBtnDisabled: {
    opacity: 0.7,
  },
  mainBtnTxt: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: FontSize.md,
    color: '#fff',
  },
  errorTxt: {
    fontFamily: 'Outfit_500Medium',
    fontSize: FontSize.sm,
    color: Colors.danger,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  toggleBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  toggleBtnTxt: {
    fontFamily: 'Outfit_500Medium',
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  dividerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: Spacing.sm,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
  dividerTxt: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
    color: Colors.textTertiary,
  },
  demoBtn: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  demoBtnTxt: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: FontSize.md,
    color: Colors.accent,
  },

  // Onboarding
  onboardingBox: { gap: Spacing.lg },
  onboardingTitle: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: Colors.textPrimary, textAlign: 'center' },
  onboardingSub: { fontFamily: 'Outfit_400Regular', fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  sectorPicker: { gap: Spacing.sm, marginTop: Spacing.md },
  sectorBtn: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  sectorBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '11' },
  sectorBtnTxt: { fontFamily: 'Outfit_500Medium', fontSize: FontSize.md, color: Colors.textSecondary },
  sectorBtnTxtActive: { color: Colors.accent, fontFamily: 'Outfit_600SemiBold' },
});
