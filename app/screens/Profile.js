import { SafeAreaView, View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, TouchableOpacity } from 'react-native';
import React, { useContext, useEffect, useState } from 'react';
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

// ISO weekdays, matching profiles.preferred_breakfast_days (1 = Monday).
const WEEKDAYS = [
    { id: 1, label: 'Mon' }, { id: 2, label: 'Tue' }, { id: 3, label: 'Wed' }, { id: 4, label: 'Thu' },
    { id: 5, label: 'Fri' }, { id: 6, label: 'Sat' }, { id: 7, label: 'Sun' }
];

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
    const [breakfastId, setBreakfastId] = useState(profile?.preferred_breakfast_recipe_id ?? null);
    const [breakfastDays, setBreakfastDays] = useState(profile?.preferred_breakfast_days ?? []);
    const [breakfastOptions, setBreakfastOptions] = useState([{ id: null, label: 'None' }]);
    const [loadingBreakfasts, setLoadingBreakfasts] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        supabase.rpc('get_user_recipes', { p_user_id: session.user.id }).then(({ data, error }) => {
            if (error) {
                console.log('Error loading recipes:', error);
            } else {
                // recipes marked for breakfast, plus the current pick if it isn't
                const recipes = (data || []).filter((r) => r.meals?.includes(1) || r.recipe_id === breakfastId);
                setBreakfastOptions([{ id: null, label: 'None' }, ...recipes.map((r) => ({ id: r.recipe_id, label: r.name }))]);
            }
            setLoadingBreakfasts(false);
        });
    }, []);

    const toggleDay = (day) => {
        setBreakfastDays((days) => days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort());
    };
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
        days: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            width: '95%',
            marginTop: 12
        },
        day: {
            paddingVertical: 10,
            borderRadius: 999,
            width: 44,
            alignItems: 'center'
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
            preferred_breakfast_recipe_id: breakfastId,
            preferred_breakfast_days: breakfastId ? breakfastDays : [],
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
                    <Text style={profileStyles.fieldLabel}>Preferred breakfast</Text>
                    <Dropdown
                        data={breakfastOptions}
                        label="Choose a recipe"
                        loading={loadingBreakfasts}
                        onSelect={(selected) => setBreakfastId(selected.id)}
                        value={breakfastOptions.findIndex((option) => option.id === breakfastId)}
                    />
                    {breakfastId ? (
                        <>
                            <View style={profileStyles.days}>
                                {WEEKDAYS.map((day) => {
                                    const selected = breakfastDays.includes(day.id);
                                    return (
                                        <TouchableOpacity
                                            key={day.id}
                                            style={[profileStyles.day, { backgroundColor: selected ? '#00AEFF' : colours.card }]}
                                            onPress={() => toggleDay(day.id)}
                                            accessibilityRole="checkbox"
                                            accessibilityState={{ checked: selected }}
                                            accessibilityLabel={day.label}
                                        >
                                            <Text style={[styles.text, { fontSize: 14 }]}>{day.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            <Text style={[styles.lowImpactText, profileStyles.hint]}>
                                Suggestions and generated plans use this breakfast on the days you pick.
                            </Text>
                        </>
                    ) : null}
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
