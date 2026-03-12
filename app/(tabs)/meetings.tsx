import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import Ionicons from '@expo/vector-icons/Ionicons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Meeting {
  id: string;
  created_at: string;
  prospect_nom: string;
  prospect_secteur: string;
  duree_audio: string;
  transcription: string;
  score_global: number;
  indicateurs: any;
  besoins: any;
  prestations: any;
  plan_action: any;
  audio_url?: string;
  propositions_techniques?: any;
  email_suivi?: any;
}

export default function MeetingsScreen() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecorder, setShowRecorder] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [processingState, setProcessingState] = useState<'idle' | 'recording' | 'transcribing' | 'analyzing' | 'saving'>('idle');
  
  const { isRecording, duration, startRecording, stopRecording } = useAudioRecorder();

  useEffect(() => {
    loadMeetings();
  }, []);

  const loadMeetings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reunions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      console.error('Error loading meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartRecording = async () => {
    setProcessingState('recording');
    await startRecording();
  };

  const handleStopRecording = async () => {
    const result = await stopRecording();
    if (!result) {
      setProcessingState('idle');
      return;
    }

    try {
      setProcessingState('transcribing');
      const { audioBase64, duration: audioDuration } = result;

      // 1. Transcribe
      const { data: transData, error: transError } = await supabase.functions.invoke('transcribe-audio', {
        body: { audioBase64, duration: audioDuration }
      });
      if (transError) throw transError;
      const transcription = transData.transcription;

      // 2. Analyze
      setProcessingState('analyzing');
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyse-reunion', {
        body: { transcription }
      });
      if (analysisError) throw analysisError;
      const analysis = analysisData.analysis;

      // 3. Save to Supabase
      setProcessingState('saving');
      const { data: savedData, error: saveError } = await supabase
        .from('reunions')
        .insert([{
          prospect_nom: analysis.prospect_nom,
          prospect_secteur: analysis.prospect_secteur,
          duree_audio: `${Math.floor(audioDuration / 1000)}s`,
          transcription,
          score_global: analysis.score_global,
          indicateurs: analysis.indicateurs,
          besoins: analysis.besoins_detectes,
          prestations: analysis.prestations_recommandees,
          plan_action: analysis.plan_action,
          propositions_techniques: analysis.propositions_techniques,
          email_suivi: analysis.email_suivi,
          budget_detecte: analysis.budget_detecte,
          deadline_detectee: analysis.deadline_detectee,
          mots_cles: analysis.mots_cles,
          decideurs: analysis.decideurs_identifies,
          concurrents: analysis.concurrents_mentionnes
        }])
        .select()
        .single();

      if (saveError) throw saveError;

      setMeetings([savedData, ...meetings]);
      setSelectedMeeting(savedData);
      setShowRecorder(false);
    } catch (err) {
      console.error('Processing failed:', err);
      alert('Une erreur est survenue lors du traitement de la réunion.');
    } finally {
      setProcessingState('idle');
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Réunions</Text>
          <Text style={styles.headerSub}>Intelligence conversationnelle</Text>
        </View>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setShowRecorder(true)}
        >
          <Ionicons name="add" size={24} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.electric} />
        </View>
      ) : meetings.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="mic-outline" size={64} color={Colors.grey400} />
          <Text style={styles.emptyText}>Aucune réunion enregistrée</Text>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => setShowRecorder(true)}
          >
            <Text style={styles.primaryButtonText}>Enregistrer ma première réunion</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={styles.scrollList}
          showsVerticalScrollIndicator={false}
        >
          {meetings.map((m) => (
            <TouchableOpacity 
              key={m.id} 
              style={styles.meetingCard}
              onPress={() => setSelectedMeeting(m)}
            >
              <View style={styles.meetingCardHeader}>
                <View style={[styles.avatar, { backgroundColor: m.score_global > 70 ? Colors.success + '20' : Colors.electric + '20' }]}>
                  <Text style={[styles.avatarText, { color: m.score_global > 70 ? Colors.success : Colors.electric }]}>
                    {m.prospect_nom?.substring(0, 2).toUpperCase() || '??'}
                  </Text>
                </View>
                <View style={styles.meetingInfo}>
                  <Text style={styles.meetingTitle}>{m.prospect_nom || 'Réunion sans nom'}</Text>
                  <Text style={styles.meetingSub}>{m.prospect_secteur || 'Secteur inconnu'} • {new Date(m.created_at).toLocaleDateString()}</Text>
                </View>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreText}>{m.score_global}/100</Text>
                </View>
              </View>
              <Text style={styles.meetingPreview} numberOfLines={2}>
                {m.transcription || 'Pas de transcription disponible.'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Recorder Modal */}
      <Modal visible={showRecorder} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.recorderContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle Réunion</Text>
              <TouchableOpacity onPress={() => !isRecording && setShowRecorder(false)}>
                <Ionicons name="close" size={24} color={Colors.black} />
              </TouchableOpacity>
            </View>

            <View style={styles.recorderContent}>
              <Text style={styles.timer}>{formatDuration(duration)}</Text>
              
              <View style={styles.visualizerContainer}>
                {/* Placeholder for waveform visualizer */}
                <View style={styles.visualizerPlaceholder}>
                  {isRecording && <ActivityIndicator color={Colors.electric} size="large" />}
                </View>
              </View>

              <View style={styles.statusContainer}>
                {processingState !== 'idle' && processingState !== 'recording' && (
                  <View style={styles.processingRow}>
                    <ActivityIndicator size="small" color={Colors.electric} />
                    <Text style={styles.processingText}>
                      {processingState === 'transcribing' && 'Transcription en cours...'}
                      {processingState === 'analyzing' && 'Analyse par IA...'}
                      {processingState === 'saving' && 'Enregistrement...'}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity 
                style={[
                  styles.recordButton, 
                  isRecording ? styles.stopButton : styles.startButton,
                  processingState !== 'idle' && processingState !== 'recording' && { opacity: 0.5 }
                ]}
                onPress={isRecording ? handleStopRecording : handleStartRecording}
                disabled={processingState !== 'idle' && processingState !== 'recording'}
              >
                <Ionicons 
                  name={isRecording ? "stop" : "mic"} 
                  size={32} 
                  color={Colors.white} 
                />
              </TouchableOpacity>
              <Text style={styles.recordInstruction}>
                {isRecording ? "Appuyez pour terminer" : "Appuyez pour démarrer l'enregistrement"}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Analysis Detail Modal */}
      <Modal visible={!!selectedMeeting} animationType="slide">
        <SafeAreaView style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setSelectedMeeting(null)}>
              <Ionicons name="arrow-back" size={24} color={Colors.black} />
            </TouchableOpacity>
            <Text style={styles.detailTitle}>Compte Rendu</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedMeeting && (
            <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.detailIdCard}>
                <View style={styles.detailIdHeader}>
                  <Text style={styles.detailProspectName}>{selectedMeeting.prospect_nom}</Text>
                  <View style={[styles.detailScoreBadge, { backgroundColor: selectedMeeting.score_global > 70 ? Colors.success : Colors.electric }]}>
                    <Text style={styles.detailScoreText}>{selectedMeeting.score_global}/100</Text>
                  </View>
                </View>
                <Text style={styles.detailProspectSector}>{selectedMeeting.prospect_secteur}</Text>
                <Text style={styles.detailDate}>{new Date(selectedMeeting.created_at).toLocaleString()} • {selectedMeeting.duree_audio}</Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Analyse du besoin</Text>
                <View style={styles.indicatorsRow}>
                  {Object.entries(selectedMeeting.indicateurs || {}).map(([key, val]) => (
                    <View key={key} style={styles.indicatorCard}>
                      <Text style={styles.indicatorValue}>{String(val)}%</Text>
                      <Text style={styles.indicatorLabel}>{key}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.tagsContainer}>
                  {(selectedMeeting.besoins || []).map((b: string, i: number) => (
                    <View key={i} style={styles.tag}><Text style={styles.tagText}>{b}</Text></View>
                  ))}
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Plan d'action IA</Text>
                {(selectedMeeting.plan_action || []).map((step: string, i: number) => (
                  <View key={i} style={styles.actionStep}>
                    <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Propositions Techniques</Text>
                {(selectedMeeting.propositions_techniques || []).map((prop: any, i: number) => (
                  <View key={i} style={styles.propCard}>
                    <View style={styles.propHeader}>
                      <Text style={styles.propEmoji}>{prop.emoji}</Text>
                      <Text style={styles.propTitle}>{prop.titre}</Text>
                    </View>
                    <Text style={styles.propDesc}>{prop.description}</Text>
                    <View style={styles.propBudgetContainer}>
                      <Text style={styles.propBudgetText}>Budget estimé : {prop.budget_estime}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Brouillon Email de Suivi</Text>
                <View style={styles.emailCard}>
                  <Text style={styles.emailSubject}>Objet : {selectedMeeting.email_suivi?.objet}</Text>
                  <View style={styles.divider} />
                  <Text style={styles.emailBody}>{selectedMeeting.email_suivi?.corps}</Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Transcription complète</Text>
                <Text style={styles.transcriptionText}>{selectedMeeting.transcription}</Text>
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontFamily: Typography.displaySemiBold,
    fontSize: 28,
    color: Colors.black,
  },
  headerSub: {
    fontFamily: Typography.medium,
    fontSize: 14,
    color: Colors.grey400,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.electric,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.electric,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  scrollList: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
  emptyText: {
    fontFamily: Typography.medium,
    fontSize: 18,
    color: Colors.grey400,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: Colors.electric,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  primaryButtonText: {
    fontFamily: Typography.semiBold,
    color: Colors.white,
    fontSize: 16,
  },
  meetingCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#E8E4DB',
  },
  meetingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Typography.bold,
    fontSize: 16,
  },
  meetingInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  meetingTitle: {
    fontFamily: Typography.semiBold,
    fontSize: 16,
    color: Colors.black,
  },
  meetingSub: {
    fontFamily: Typography.regular,
    fontSize: 12,
    color: Colors.grey400,
  },
  scoreBadge: {
    backgroundColor: '#F0F7FF',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  scoreText: {
    fontFamily: Typography.bold,
    fontSize: 14,
    color: Colors.electric,
  },
  meetingPreview: {
    fontFamily: Typography.regular,
    fontSize: 14,
    color: Colors.grey400,
    lineHeight: 20,
  },
  // Modal Recorder
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  recorderContainer: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    minHeight: 450,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    fontFamily: Typography.displaySemiBold,
    fontSize: 20,
    color: Colors.black,
  },
  recorderContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  timer: {
    fontFamily: Typography.displaySemiBold,
    fontSize: 48,
    color: Colors.black,
    marginBottom: Spacing.lg,
  },
  visualizerContainer: {
    width: '100%',
    height: 100,
    marginBottom: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualizerPlaceholder: {
    width: '80%',
    height: 4,
    backgroundColor: '#F0F0F0',
    borderRadius: 2,
    justifyContent: 'center',
  },
  statusContainer: {
    height: 40,
    marginBottom: Spacing.lg,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  processingText: {
    fontFamily: Typography.medium,
    fontSize: 14,
    color: Colors.electric,
  },
  recordButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  startButton: {
    backgroundColor: Colors.electric,
    shadowColor: Colors.electric,
  },
  stopButton: {
    backgroundColor: Colors.danger,
    shadowColor: Colors.danger,
  },
  recordInstruction: {
    fontFamily: Typography.medium,
    fontSize: 14,
    color: Colors.grey400,
  },
  // Detail Modal
  detailContainer: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E4DB',
  },
  detailTitle: {
    fontFamily: Typography.displaySemiBold,
    fontSize: 18,
    color: Colors.black,
  },
  detailScroll: {
    padding: Spacing.lg,
  },
  detailIdCard: {
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  detailIdHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  detailProspectName: {
    fontFamily: Typography.displaySemiBold,
    fontSize: 24,
    color: Colors.black,
    flex: 1,
  },
  detailScoreBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  detailScoreText: {
    fontFamily: Typography.bold,
    fontSize: 16,
    color: Colors.white,
  },
  detailProspectSector: {
    fontFamily: Typography.medium,
    fontSize: 16,
    color: Colors.electric,
    marginBottom: Spacing.sm,
  },
  detailDate: {
    fontFamily: Typography.regular,
    fontSize: 13,
    color: Colors.grey400,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontFamily: Typography.displaySemiBold,
    fontSize: 18,
    color: Colors.black,
    marginBottom: Spacing.md,
  },
  indicatorsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  indicatorCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    width: (SCREEN_WIDTH - Spacing.lg * 2 - 20) / 4,
    alignItems: 'center',
  },
  indicatorValue: {
    fontFamily: Typography.bold,
    fontSize: 16,
    color: Colors.black,
  },
  indicatorLabel: {
    fontFamily: Typography.regular,
    fontSize: 10,
    color: Colors.grey400,
    textTransform: 'uppercase',
    marginTop: 2,
    textAlign: 'center',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#E8E4DB',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  tagText: {
    fontFamily: Typography.medium,
    fontSize: 13,
    color: Colors.black,
  },
  actionStep: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginBottom: Spacing.sm,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.electric,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  stepNumText: {
    color: Colors.white,
    fontFamily: Typography.bold,
    fontSize: 12,
  },
  stepText: {
    flex: 1,
    fontFamily: Typography.medium,
    fontSize: 14,
    color: Colors.black,
  },
  propCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  propHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  propEmoji: {
    fontSize: 24,
    marginRight: Spacing.sm,
  },
  propTitle: {
    fontFamily: Typography.semiBold,
    fontSize: 16,
    color: Colors.black,
    flex: 1,
  },
  propDesc: {
    fontFamily: Typography.regular,
    fontSize: 14,
    color: Colors.grey400,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  propBudgetContainer: {
    backgroundColor: Colors.cream,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
  },
  propBudgetText: {
    fontFamily: Typography.bold,
    fontSize: 14,
    color: Colors.black,
  },
  emailCard: {
    backgroundColor: Colors.grey100,
    borderRadius: Radius.md,
    padding: Spacing.lg,
  },
  emailSubject: {
    fontFamily: Typography.semiBold,
    fontSize: 14,
    color: Colors.white,
    marginBottom: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.grey200,
    marginVertical: Spacing.md,
  },
  emailBody: {
    fontFamily: Typography.regular,
    fontSize: 14,
    color: Colors.grey600,
    lineHeight: 22,
  },
  transcriptionText: {
    fontFamily: Typography.regular,
    fontSize: 14,
    color: Colors.grey400,
    lineHeight: 22,
    fontStyle: 'italic',
  }
});
