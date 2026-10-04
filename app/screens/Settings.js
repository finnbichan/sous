import { supabase } from '../../supabase';
import { View, Text, Pressable, SafeAreaView, Modal, StyleSheet, TextInput, ScrollView, ActivityIndicator, Image } from 'react-native';
import React, { useState, useCallback, useContext } from 'react';
import useStyles from '../styles/Common';
import AppButton from '../components/AppButton';
import AppHeaderText from '../components/AppHeaderText';
import { useTheme, useFocusEffect } from '@react-navigation/native';
import { CacheContext } from '../../Contexts';

const Settings = ({ navigation }) => {
    const [inviteModalOpen, setInviteModalOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [emailError, setEmailError] = useState('');
    const [invites, setInvites] = useState([]);
    const [loadingInvites, setLoadingInvites] = useState(false);
    const [sharingError, setSharingError] = useState('');
    const [sharingBusy, setSharingBusy] = useState(false);
    const { setCache } = useContext(CacheContext);
    const { colours, assets } = useTheme();
    const styles = useStyles();

    // status: 0 = pending, 1 = accepted (get_invites only returns these)
    const activeShare = invites.find(inv => inv.status === 1);
    const receivedInvites = invites.filter(inv => inv.status === 0 && !inv.is_sender);
    const sentInvites = invites.filter(inv => inv.status === 0 && inv.is_sender);
    const isSharing = Boolean(activeShare);

    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const fetchInvites = async () => {
        setLoadingInvites(true);
        try {
            const { data, error } = await supabase.rpc('get_invites');
            if (error) {
                console.error('Error fetching invites:', error);
            } else {
                setInvites(data || []);
            }
        } catch (err) {
            console.error('Unexpected error fetching invites:', err);
        }
        setLoadingInvites(false);
    };

    // The Account tab stays mounted, so refresh invites each time it's opened.
    useFocusEffect(useCallback(() => {
        fetchInvites();
    }, []));

    // accept_invite / reject_invite / remove_sharing all take the invite id
    const runSharingAction = async (rpc, inviteId) => {
        if (sharingBusy) return;
        setSharingBusy(true);
        setSharingError('');
        const { error } = await supabase.rpc(rpc, { p_invite_id: inviteId });
        if (error) {
            console.error(`Error calling ${rpc}:`, error);
            setSharingError('Something went wrong. Please try again.');
        } else {
            // lists changed: make the List screen reload
            setCache(Date.now());
        }
        await fetchInvites();
        setSharingBusy(false);
    };

    const handleInvitePress = async () => {
        setEmailError('');
        if (!inviteEmail.trim()) {
            setEmailError('Please enter an email address');
            return;
        }
        if (!validateEmail(inviteEmail)) {
            setEmailError('Please enter a valid email address');
            return;
        }
        
        try {
            const { error } = await supabase.rpc('invite_user_by_email', {
                p_email: inviteEmail.trim()
            });
            
            if (error) {
                console.error('Error inviting user:', error);
                setEmailError(error.message || 'Failed to send invite');
                return;
            }
            
            setInviteEmail('');
            setInviteModalOpen(false);
            await fetchInvites();
        } catch (err) {
            console.error('Unexpected error:', err);
            setEmailError('An unexpected error occurred');
        }
    };

    const handleCloseInviteModal = () => {
        setInviteEmail('');
        setEmailError('');
        setInviteModalOpen(false);
    };

    function logOut() {
        supabase.auth.signOut();
    }

    const settingsStyles = StyleSheet.create({
        section: {
            marginBottom: 24,
            width: '100%'
        },
        sectionTitle: {
            fontSize: 16,
            fontWeight: '600',
            color: colours.text,
            marginBottom: 12,
            marginLeft: 16,
            marginTop: 8
        },
        buttonContainer: {
            marginHorizontal: 8,
            marginVertical: 8
        },
        sharingButton: {
            backgroundColor: colours.card,
            borderColor: colours.text,
            borderWidth: 1,
            marginHorizontal: 8,
            borderRadius: 4,
            paddingVertical: 12,
            paddingHorizontal: 8
        },
        sharingButtonDisabled: {
            backgroundColor: colours.card,
            borderColor: '#999',
            borderWidth: 1,
            marginHorizontal: 8,
            borderRadius: 4,
            paddingVertical: 12,
            paddingHorizontal: 8,
            opacity: 0.6
        },
        sharingButtonText: {
            color: colours.text,
            fontSize: 16,
            fontWeight: '500',
            textAlign: 'center'
        },
        sharingButtonTextDisabled: {
            color: '#999',
            fontSize: 16,
            fontWeight: '500',
            textAlign: 'center'
        },
        inviteCard: {
            backgroundColor: colours.card,
            borderRadius: 4,
            padding: 12,
            marginHorizontal: 8,
            marginBottom: 10,
            borderLeftWidth: 4,
            borderLeftColor: colours.text
        },
        inviteMessage: {
            color: colours.text,
            fontSize: 14,
            marginBottom: 10,
            fontWeight: '500'
        },
        inviteButtonRow: {
            flexDirection: 'row',
            gap: 8
        },
        smallButton: {
            flex: 1,
            backgroundColor: colours.card,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: colours.text,
            paddingVertical: 8,
            paddingHorizontal: 8
        },
        menuRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colours.card,
            borderRadius: 8,
            paddingVertical: 14,
            paddingHorizontal: 16,
            marginHorizontal: 8,
            marginBottom: 8
        },
        menuRowText: {
            color: colours.text,
            fontSize: 18
        },
        smallButtonText: {
            color: colours.text,
            fontSize: 12,
            fontWeight: '500',
            textAlign: 'center'
        }
    });

    const modalStyles = StyleSheet.create({
        overlay: {
            height: '100%',
            width: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.7)'
        },
        modal: {
            backgroundColor: colours.background,
            padding: 20,
            width: '90%',
            justifyContent: 'space-evenly',
            alignItems: 'center',
            alignSelf: 'center',
            marginTop: '150',
            position: 'absolute',
            borderRadius: 8,
            flexGrow: 0
        },
        emailInput: {
            backgroundColor: colours.card,
            borderRadius: 4,
            padding: 12,
            width: '100%',
            color: colours.text,
            margin: 10,
            fontSize: 16,
            marginBottom: emailError ? 4 : 10
        },
        errorText: {
            color: '#ef4444',
            fontSize: 14,
            marginBottom: 10,
            alignSelf: 'flex-start',
            marginLeft: 10
        },
        buttonRow: {
            flexDirection: 'row',
            gap: 10,
            width: '100%',
            marginTop: 10
        }
    });

    return (
        <SafeAreaView style={styles.container}>
            <AppHeaderText>Account</AppHeaderText>
            <ScrollView contentContainerStyle={{ paddingVertical: 20, alignItems: 'center' }}>
                <View style={settingsStyles.section}>
                    {[['Profile & preferences', 'Profile'], ['Meal history', 'Meal History']].map(([label, screen]) => (
                        <Pressable
                            key={screen}
                            style={settingsStyles.menuRow}
                            onPress={() => navigation.navigate(screen)}
                            accessibilityRole="button"
                            accessibilityLabel={label}
                        >
                            <Text style={settingsStyles.menuRowText}>{label}</Text>
                            <Image style={{ width: 24, height: 24 }} source={assets.chevron_right} />
                        </Pressable>
                    ))}
                </View>
                {/* Sharing Settings Section */}
                <View style={settingsStyles.section}>
                    <Text style={settingsStyles.sectionTitle}>Sharing</Text>
                    
                    {loadingInvites ? (
                        <ActivityIndicator size="large" color={colours.text} style={{ marginVertical: 20 }} />
                    ) : (
                        <>
                            {/* Active share */}
                            {activeShare ? (
                                <View style={settingsStyles.inviteCard}>
                                    <Text style={settingsStyles.inviteMessage}>
                                        You are sharing a list with {activeShare.other_name}
                                    </Text>
                                    <Pressable
                                        style={[settingsStyles.smallButton, { borderColor: '#EF4444' }]}
                                        onPress={() => runSharingAction('remove_sharing', activeShare.invite_id)}
                                        disabled={sharingBusy}
                                    >
                                        <Text style={[settingsStyles.smallButtonText, { color: '#EF4444' }]}>Stop sharing</Text>
                                    </Pressable>
                                </View>
                            ) : null}

                            {/* Invites received */}
                            {receivedInvites.map((invite) => (
                                <View key={invite.invite_id} style={settingsStyles.inviteCard}>
                                    <Text style={settingsStyles.inviteMessage}>
                                        {invite.other_name} has invited you to their shared list
                                    </Text>
                                    <View style={settingsStyles.inviteButtonRow}>
                                        <Pressable
                                            style={[settingsStyles.smallButton, { borderColor: '#4CAF50' }]}
                                            onPress={() => runSharingAction('accept_invite', invite.invite_id)}
                                            disabled={sharingBusy || isSharing}
                                        >
                                            <Text style={[settingsStyles.smallButtonText, { color: '#4CAF50' }]}>Accept</Text>
                                        </Pressable>
                                        <Pressable
                                            style={[settingsStyles.smallButton, { borderColor: '#EF4444' }]}
                                            onPress={() => runSharingAction('reject_invite', invite.invite_id)}
                                            disabled={sharingBusy}
                                        >
                                            <Text style={[settingsStyles.smallButtonText, { color: '#EF4444' }]}>Reject</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            ))}

                            {/* Invites sent */}
                            {sentInvites.map((invite) => (
                                <View key={invite.invite_id} style={settingsStyles.inviteCard}>
                                    <Text style={settingsStyles.inviteMessage}>
                                        Invite sent to {invite.other_name}
                                    </Text>
                                    <Pressable
                                        style={[settingsStyles.smallButton, { borderColor: '#EF4444' }]}
                                        onPress={() => runSharingAction('remove_sharing', invite.invite_id)}
                                        disabled={sharingBusy}
                                    >
                                        <Text style={[settingsStyles.smallButtonText, { color: '#EF4444' }]}>Cancel invite</Text>
                                    </Pressable>
                                </View>
                            ))}
                        </>
                    )}
                    
                    {sharingError ? (
                        <Text style={[styles.errorText, { marginBottom: 8 }]}>{sharingError}</Text>
                    ) : null}
                    <Pressable
                        onPress={() => setInviteModalOpen(true)}
                        disabled={isSharing}
                        style={isSharing ? settingsStyles.sharingButtonDisabled : settingsStyles.sharingButton}
                    >
                        <Text style={isSharing ? settingsStyles.sharingButtonTextDisabled : settingsStyles.sharingButtonText}>
                            Invite a user to share
                        </Text>
                    </Pressable>
                </View>
                {/* Account Settings Section */}
                <View style={settingsStyles.section}>
                    <Text style={settingsStyles.sectionTitle}>Account</Text>
                    <View style={settingsStyles.buttonContainer}>
                        <Pressable onPress={logOut} style={styles.logOutButton}>
                            <Text style={styles.buttonText}>Log out</Text>
                        </Pressable>
                    </View>
                </View>
            </ScrollView>

            <Modal
                visible={inviteModalOpen}
                animationType="none"
                transparent
            >
                <Pressable
                    style={modalStyles.overlay}
                    onPress={handleCloseInviteModal}
                />
                <View style={modalStyles.modal}>
                    <AppHeaderText>Invite a user</AppHeaderText>
                    <TextInput
                        style={modalStyles.emailInput}
                        placeholder="Email address"
                        placeholderTextColor={colours.secondaryText}
                        value={inviteEmail}
                        onChangeText={setInviteEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                    {emailError ? (
                        <Text style={modalStyles.errorText}>{emailError}</Text>
                    ) : null}
                    <View style={modalStyles.buttonRow}>
                        <View style={{ flex: 1 }}>
                            <AppButton
                                label="Cancel"
                                onPress={handleCloseInviteModal}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <AppButton
                                label="Invite"
                                onPress={handleInvitePress}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default Settings;
