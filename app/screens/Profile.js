import { SafeAreaView, View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import React, { useContext, useState } from 'react';
import { useTheme } from '@react-navigation/native';
import useStyles from '../styles/Common';
import AppHeaderText from '../components/AppHeaderText';
import AppButton from '../components/AppButton';
import AccountBackButton from '../components/AccountBackButton';
import FLTextInput from '../components/FloatingLabelInput';
import Dropdown from '../components/Dropdown';
import Ingredients from '../components/Ingredients';
import { supabase } from '../../supabase';
import { AuthContext, ProfileContext } from '../../Contexts';
import '../../globals';

const portionSizeOptions = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: n, label: String(n) }));

const toEditableList = (values) => (values?.length ? [...values] : [null]);

const cleanTextArray = (values) => {
    const cleaned = values.map((value) => value?.trim()).filter((value) => value);
    return cleaned.length ? cleaned : null;
};

const Profile = () => {
    const { colours } = useTheme();
    const styles = useStyles();
    const session = useContext(AuthContext);
    const { profile, setProfile } = useContext(ProfileContext);
    const [displayName, setDisplayName] = useState(profile?.display_name || '');
    const [dietary, setDietary] = useState(profile?.dietary ?? 0);
    const [portionSize, setPortionSize] = useState(profile?.portion_size ?? null);
    const [allergies, setAllergies] = useState(toEditableList(profile?.allergies));
    const [dislikes, setDislikes] = useState(toEditableList(profile?.dislikes));
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);

    const profileStyles = StyleSheet.create({
        content: {
            width: '100%',
            alignItems: 'center',
            paddingTop: 10,
            paddingBottom: 40
        },
        header: {
            alignSelf: 'flex-start',
            paddingHorizontal: 8
        },
        fieldLabel: {
            width: '95%',
            color: colours.secondaryText,
            fontSize: 14,
            marginTop: 16,
            marginBottom: -10,
            marginLeft: 12,
            alignSelf: 'flex-start'
        },
        hint: {
            alignSelf: 'flex-start',
            marginHorizontal: 12,
            marginTop: 4
        },
        message: {
            alignSelf: 'flex-start',
            marginHorizontal: 12,
            marginTop: 12
        }
    });

    const listEditor = (values, setValues) => ({
        onAddition: () => setValues([...values, null]),
        onChangeText: (index, text) => {
            const next = [...values];
            next[index] = text;
            setValues(next);
        },
        onRemove: (index) => {
            const next = [...values];
            next.splice(index, 1);
            setValues(next.length ? next : [null]);
        }
    });

    const save = async () => {
        const trimmedName = displayName.trim();
        if (!trimmedName) {
            setIsError(true);
            setMessage('Please add a display name.');
            return;
        }

        setSaving(true);
        setMessage('');
        const updates = {
            display_name: trimmedName,
            dietary,
            portion_size: portionSize,
            allergies: cleanTextArray(allergies),
            dislikes: cleanTextArray(dislikes),
            updated_at: new Date().toISOString()
        };
        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', session.user.id);
        setSaving(false);

        if (error) {
            console.log('Error saving profile:', error);
            setIsError(true);
            setMessage('Could not save your changes. Please try again.');
            return;
        }

        setProfile((current) => ({ ...current, ...updates }));
        setIsError(false);
        setMessage('Saved.');
    };

    return (
        <SafeAreaView style={styles.container}>
            <AccountBackButton />
            <KeyboardAvoidingView
                style={{ flex: 1, width: '100%' }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={profileStyles.content} keyboardShouldPersistTaps="handled">
                    <View style={profileStyles.header}>
                        <AppHeaderText>Profile & Preferences</AppHeaderText>
                    </View>
                    <FLTextInput
                        id="display-name"
                        label="Display name"
                        defaultValue={displayName}
                        onChangeTextProp={setDisplayName}
                        multiline={false}
                    />
                    <Text style={profileStyles.fieldLabel}>Are you vegetarian or vegan?</Text>
                    <Dropdown
                        data={dietList}
                        label="Veggie or vegan?"
                        onSelect={(selected) => setDietary(Number(selected.id))}
                        value={dietary}
                    />
                    <Text style={profileStyles.fieldLabel}>How many are you normally cooking for?</Text>
                    <Dropdown
                        data={portionSizeOptions}
                        label="Portion size"
                        onSelect={(selected) => setPortionSize(Number(selected.id))}
                        value={portionSizeOptions.findIndex((option) => option.id === portionSize)}
                    />
                    <Text style={[profileStyles.fieldLabel, { marginBottom: 4 }]}>Allergies</Text>
                    <Ingredients
                        ingredients={allergies}
                        {...listEditor(allergies, setAllergies)}
                        editable={true}
                        firstPlaceholder="Add an allergy..."
                        nextPlaceholder="Add another allergy..."
                    />
                    <Text style={[profileStyles.fieldLabel, { marginBottom: 4 }]}>Dislikes</Text>
                    <Ingredients
                        ingredients={dislikes}
                        {...listEditor(dislikes, setDislikes)}
                        editable={true}
                        firstPlaceholder="Add a dislike..."
                        nextPlaceholder="Add another dislike..."
                    />
                    <Text style={[styles.lowImpactText, profileStyles.hint]}>
                        Suggestions and generated plans skip recipes that don't fit your diet or mention an allergy or dislike.
                    </Text>
                    {message ? (
                        <Text style={isError ? styles.errorText : [styles.lowImpactText, profileStyles.message]}>{message}</Text>
                    ) : null}
                    {saving ? (
                        <ActivityIndicator style={{ marginTop: 20 }} />
                    ) : (
                        <AppButton label="Save" onPress={save} />
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default Profile;
