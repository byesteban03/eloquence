import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  Dimensions,
  Linking,
  Platform,
  StatusBar,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../constants/tokens';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

type PaywallProps = {
  trigger: 'analyse_limit' | 'zone_limit' | 'feature_locked' | 'manual';
  featureName?: string;
  onClose: () => void;
};

// ─── Social Proof Logic ───────────────────────────────────────────────────────

function getSocialProofCount(): number {
  const now = new Date();
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = 7 * 60 + 30;  // 7h30
  const peakMinutes = 18 * 60;       // 18h00
  const endMinutes = 23 * 60;        // 23h00

  if (totalMinutes < startMinutes) return 0;

  let base = 0;
  if (totalMinutes <= peakMinutes) {
    const progress = (totalMinutes - startMinutes) / (peakMinutes - startMinutes);
    const eased = Math.pow(progress, 0.7);
    base = Math.round(eased * 292);
  } else if (totalMinutes <= endMinutes) {
    const progress = (totalMinutes - peakMinutes) / (endMinutes - peakMinutes);
    base = Math.round(292 - progress * 60);
  } else {
    return 0;
  }

  const seed = Math.floor(totalMinutes / 3);
  const noise = ((seed * 1103515245 + 12345) & 0x7fffffff) % 21 - 10;
  return Math.max(0, base + noise);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const FeatureRow = ({ icon, title, subtitle, badge, badgeColor, iconBg, showDivider }: any) => (
  <>
    <View style={styles.featRow}>
      <View style={[styles.featIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={16} color={badgeColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featTitle}>{title}</Text>
        <Text style={styles.featSub}>{subtitle}</Text>
      </View>
      <View style={[styles.featBadge, { backgroundColor: badgeColor + '22' }]}>
        <Text style={[styles.featBadgeTxt, { color: badgeColor }]}>{badge}</Text>
      </View>
    </View>
    {showDivider && (
      <View style={{ height: 0.5, backgroundColor: '#111113', marginLeft: 58 }} />
    )}
  </>
);

export default function PaywallScreen({ trigger, featureName, onClose }: PaywallProps) {
  const [selectedOption, setSelectedOption] = useState<string>('pro_annual');
  const [socialCount, setSocialCount] = useState(getSocialProofCount());
  const [userId, setUserId] = useState<string>('');

  // Animations
  const animHeader = useRef(new Animated.Value(0)).current;
  const transHeader = useRef(new Animated.Value(-20)).current;
  const animFeats = useRef(new Animated.Value(0)).current;
  const transFeats = useRef(new Animated.Value(20)).current;
  const animBilling = useRef(new Animated.Value(0)).current;
  const transBilling = useRef(new Animated.Value(20)).current;
  const animCTA = useRef(new Animated.Value(0)).current;
  const scaleCTA = useRef(new Animated.Value(0.95)).current;

  // Pulses
  const pulseBadge = useRef(new Animated.Value(1)).current;
  const pulseCTA = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || ''));

    Animated.stagger(100, [
      Animated.parallel([
        Animated.timing(animHeader, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(transHeader, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(animFeats, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(transFeats, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(animBilling, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(transBilling, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(animCTA, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(scaleCTA, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseBadge, { toValue: 0.3, duration: 750, useNativeDriver: true }),
        Animated.timing(pulseBadge, { toValue: 1, duration: 750, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseCTA, { toValue: 1.02, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseCTA, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    const interval = setInterval(() => setSocialCount(getSocialProofCount()), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleUpgrade = () => {
    const [plan, cycle] = selectedOption.split('_');
    const url = `https://eloquence.app/upgrade?plan=${plan}&cycle=${cycle}&uid=${userId}`;
    Linking.openURL(url);
  };

  const getHeadline = () => {
    if (trigger === 'zone_limit') return "Vos prospects sont partout.\nVous ne les voyez pas tous.";
    if (trigger === 'feature_locked') return "Cette feature Pro\nchange tout.";
    return "Vos concurrents\nanalysent déjà\n";
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        {/* Header Section */}
        <Animated.View style={[styles.section, { opacity: animHeader, transform: [{ translateY: transHeader }] }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.proBadge}>
            <Animated.View style={[styles.pulseDot, { opacity: pulseBadge }]} />
            <Text style={styles.proBadgeTxt}>ÉLOQUENCE PREMIUM</Text>
          </View>

          <Text style={styles.headline}>
            {getHeadline()}
            {trigger !== 'zone_limit' && trigger !== 'feature_locked' && (
              <Text style={{ color: '#4F6EF7' }}>leurs réunions.</Text>
            )}
          </Text>
          <Text style={styles.subHeadline}>
            {"Passez à la vitesse supérieure.\nNe laissez plus aucun prospect vous échapper."}
          </Text>
        </Animated.View>

        {/* Feature List Section */}
        <Animated.View style={[styles.featsCard, { opacity: animFeats, transform: [{ translateY: transFeats }] }]}>
          <FeatureRow 
            icon="time-outline" 
            title="Analyses IA boostées" 
            subtitle="Jusqu'à illimité · Rapport en 60s" 
            badge="MAX" 
            badgeColor="#4F6EF7" 
            iconBg="#080E20"
            showDivider
          />
          <FeatureRow 
            icon="trending-up-outline" 
            title="Détection d'opportunités" 
            subtitle="Zones géo custom · Types illimités" 
            badge="∞" 
            badgeColor="#10B981" 
            iconBg="#0A1A0F"
            showDivider
          />
          <FeatureRow 
            icon="document-text-outline" 
            title="Export PDF + enrichissement" 
            subtitle="Données d'entreprises · Contacts · Scoring" 
            badge="PRO+" 
            badgeColor="#A855F7" 
            iconBg="#140A1A"
            showDivider
          />
          <FeatureRow 
            icon="people-outline" 
            title="Plan Équipe" 
            subtitle="Partage de zones · Jusqu'à 5 users · Dashboard" 
            badge="TEAM" 
            badgeColor="#F59E0B" 
            iconBg="#1A1000"
            showDivider={false}
          />
        </Animated.View>

        {/* Billing Selector */}
        <Animated.View style={[styles.billingBox, { opacity: animBilling, transform: [{ translateY: transBilling }] }]}>
          
          {/* PRO PLAN */}
          <Text style={styles.tierTitle}>PLAN PRO</Text>
          <TouchableOpacity 
            style={[styles.billCard, selectedOption === 'pro_monthly' && styles.billCardActive]} 
            onPress={() => setSelectedOption('pro_monthly')}
            activeOpacity={0.9}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.billLabel, selectedOption === 'pro_monthly' && { color: '#4F6EF7' }]}>MENSUEL PRO</Text>
              <Text style={[styles.billPrice, { color: '#F0EEE8' }]}>49€/mois</Text>
            </View>
            <View style={[styles.radio, selectedOption === 'pro_monthly' && styles.radioActive]}>
              {selectedOption === 'pro_monthly' && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.billCard, styles.billCardAnnual, selectedOption === 'pro_annual' && styles.billCardActiveAnnual]} 
            onPress={() => setSelectedOption('pro_annual')}
            activeOpacity={0.9}
          >
            <View style={styles.bestChoice}>
              <Ionicons name="star" size={10} color="#FFF" />
              <Text style={styles.bestChoiceTxt}>3 MOIS OFFERTS</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.billLabel, selectedOption === 'pro_annual' && { color: '#4F6EF7' }]}>ANNUEL PRO</Text>
              <View style={styles.priceRow}>
                <Text style={styles.billPriceActive}>420€/an</Text>
                <Text style={styles.priceEq}>soit 35€/mois</Text>
              </View>
              <View style={styles.savingRow}>
                <View style={[styles.successDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.savingTxt}>Économisez 168€ — 3 mois gratuits</Text>
              </View>
            </View>
            <View style={[styles.radio, selectedOption === 'pro_annual' && styles.radioActive]}>
              {selectedOption === 'pro_annual' && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>

          {/* TEAM PLAN */}
          <Text style={[styles.tierTitle, { marginTop: 12 }]}>PLAN TEAM</Text>
          <TouchableOpacity 
            style={[styles.billCard, selectedOption === 'team_monthly' && styles.billCardActive]} 
            onPress={() => setSelectedOption('team_monthly')}
            activeOpacity={0.9}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.billLabel, selectedOption === 'team_monthly' && { color: '#F59E0B' }]}>MENSUEL TEAM</Text>
              <Text style={[styles.billPrice, { color: '#F0EEE8' }]}>119€/mois</Text>
            </View>
            <View style={[styles.radio, selectedOption === 'team_monthly' && { borderColor: '#F59E0B' }]}>
              {selectedOption === 'team_monthly' && <View style={[styles.radioInner, { backgroundColor: '#F59E0B' }]} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.billCard, styles.billCardAnnual, selectedOption === 'team_annual' && { borderColor: '#F59E0B', backgroundColor: '#1A1000' }]} 
            onPress={() => setSelectedOption('team_annual')}
            activeOpacity={0.9}
          >
            <View style={[styles.bestChoice, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="people" size={10} color="#FFF" />
              <Text style={styles.bestChoiceTxt}>3,5 MOIS OFFERTS</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.billLabel, selectedOption === 'team_annual' && { color: '#F59E0B' }]}>ANNUEL TEAM</Text>
              <View style={styles.priceRow}>
                <Text style={styles.billPriceActive}>990€/an</Text>
                <Text style={styles.priceEq}>soit 82,50€/mois</Text>
              </View>
              <View style={styles.savingRow}>
                <View style={[styles.successDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={[styles.savingTxt, { color: '#F59E0B' }]}>Économisez 438€ — Équipe de 5</Text>
              </View>
            </View>
            <View style={[styles.radio, selectedOption === 'team_annual' && { borderColor: '#F59E0B' }]}>
              {selectedOption === 'team_annual' && <View style={[styles.radioInner, { backgroundColor: '#F59E0B' }]} />}
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Social Proof Section */}
        <View style={styles.socialProof}>
          <Ionicons name="star" size={14} color="#F59E0B" />
          <Text style={styles.socialTxt}>
            <Text style={{ color: '#F0EEE8', fontFamily: 'Outfit_700Bold' }}>{socialCount}</Text>
            {' commerciaux ont analysé leur réunion aujourd\'hui avec Éloquence.'}
          </Text>
        </View>

        {/* CTA Button */}
        <Animated.View style={{ opacity: animCTA, transform: [{ scale: pulseCTA }, { scale: scaleCTA }] }}>
          <TouchableOpacity 
            style={[
              styles.ctaBtn, 
              (selectedOption.startsWith('team')) && { backgroundColor: '#F59E0B', shadowColor: '#F59E0B' }
            ]} 
            onPress={handleUpgrade} 
            activeOpacity={0.8}
          >
            <Text style={styles.ctaTitle}>Passer à {selectedOption.includes('pro') ? 'Pro' : 'Team'} →</Text>
            <Text style={styles.ctaSub}>Paiement sécurisé · Activation instantanée</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Reassurance Footer */}
        <View style={styles.footer}>
          {['Sécurisé', 'RGPD', 'Sans engagement'].map((item, i) => (
            <View key={i} style={styles.footerItem}>
              <Ionicons name="checkmark-circle" size={12} color={Colors.textTertiary} />
              <Text style={styles.footerTxt}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0E0F' },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  section: { marginBottom: 20, position: 'relative' },
  closeBtn: {
    position: 'absolute', top: 0, right: 0,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#111113', alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },

  proBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#0D1530', borderWidth: 0.5, borderColor: 'rgba(79,110,247,0.5)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5,
    alignSelf: 'center', marginBottom: 16,
  },
  pulseDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#4F6EF7' },
  proBadgeTxt: { fontFamily: 'Outfit_700Bold', fontSize: 10, color: '#4F6EF7', letterSpacing: 1.2 },

  headline: {
    fontFamily: 'Outfit_800ExtraBold', fontSize: 34, color: '#F0EEE8',
    lineHeight: 40, letterSpacing: -1, marginBottom: 10,
  },
  subHeadline: {
    fontFamily: 'Outfit_400Regular', fontSize: 13, color: '#555553',
    textAlign: 'left', lineHeight: 20,
  },

  featsCard: {
    backgroundColor: '#111113', borderRadius: Radius.lg,
    borderWidth: 0.5, borderColor: '#1A1A1D', overflow: 'hidden',
    marginBottom: 16,
  },
  featRow: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 14, paddingHorizontal: 16 },
  featIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  featTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: '#F0EEE8' },
  featSub: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: '#888780', marginTop: 1 },
  featBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  featBadgeTxt: { fontFamily: 'Outfit_700Bold', fontSize: 10 },

  billingBox: { gap: 12, marginBottom: 12 },
  billCard: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderRadius: Radius.md, backgroundColor: '#0D0D0F',
    borderWidth: 0.5, borderColor: '#1A1A1C',
  },
  billCardActive: { borderColor: '#4F6EF7', backgroundColor: '#0D0D0F' },
  billCardActiveAnnual: { borderColor: '#4F6EF7', backgroundColor: '#080E20', transform: [{ scale: 1.02 }] },
  billCardAnnual: { position: 'relative', borderWidth: 1.5 },
  bestChoice: {
    position: 'absolute', top: -10, left: 14,
    backgroundColor: '#4F6EF7', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    zIndex: 2,
  },
  bestChoiceTxt: { fontFamily: 'Outfit_700Bold', fontSize: 9, color: '#FFF' },
  billLabel: { fontFamily: 'Outfit_700Bold', fontSize: 11, color: '#333333', letterSpacing: 0.5 },
  billPrice: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: '#555553', marginTop: 2 },
  billPriceActive: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: '#FFF', marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  priceEq: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: '#888780' },
  oldPrice: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: '#2A2A2E', textDecorationLine: 'line-through' },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  successDot: { width: 5, height: 5, borderRadius: 2.5 },
  savingTxt: { fontFamily: 'Outfit_500Medium', fontSize: 11, color: '#10B981' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#1A1A1C', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#4F6EF7' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#4F6EF7' },

  tierTitle: { fontFamily: 'Outfit_700Bold', fontSize: 10, color: '#555553', letterSpacing: 1, textTransform: 'uppercase', marginLeft: 4, marginBottom: 4 },

  socialProof: {
    backgroundColor: '#111113', borderRadius: 10, padding: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
    borderWidth: 0.5, borderColor: '#1A1A1D',
  },
  socialTxt: { flex: 1, fontFamily: 'Outfit_400Regular', fontSize: 12, color: '#888780', lineHeight: 16 },

  ctaBtn: {
    backgroundColor: '#4F6EF7', borderRadius: Radius.md,
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#4F6EF7', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  ctaTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: 16, color: '#FFF', letterSpacing: -0.3 },
  ctaSub: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 },

  footer: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 20 },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerTxt: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: Colors.textTertiary },
});
