import { Modal, Pressable, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import { useTheme } from '@react-navigation/native';
import AppHeaderText from './AppHeaderText';
import AppButton from './AppButton';
import { MEAL_TYPES } from '../utils/recipes';
import { parseLocalDate } from '../utils/dates';

const useSheetStyles = () => {
    const { colours } = useTheme();
    return StyleSheet.create({
        overlay: {
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0, 0, 0, 0.5)'
        },
        sheet: {
            backgroundColor: colours.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 16,
            paddingBottom: 32,
            maxHeight: '75%'
        },
        input: {
            backgroundColor: colours.card,
            color: colours.text,
            borderRadius: 16,
            paddingHorizontal: 14,
            minHeight: 46,
            fontSize: 16,
            marginVertical: 12
        },
        suggestions: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8
        },
        chip: {
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: 999,
            backgroundColor: colours.card
        },
        chipSelected: {
            backgroundColor: '#00AEFF'
        },
        chipText: {
            color: colours.text
        },
        label: {
            color: colours.secondaryText,
            fontSize: 14,
            marginTop: 12,
            marginBottom: 8
        },
        day: {
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 16,
            backgroundColor: colours.card,
            marginBottom: 6
        },
        dayCurrent: {
            opacity: 0.4
        },
        dayText: {
            color: colours.text,
            fontSize: 16
        },
        error: {
            color: '#b22222',
            marginTop: 8
        }
    });
};

const QUICK_NOTES = ['Eating out', 'Leftovers', 'Takeaway', 'Skip'];

// Free-text meal, e.g. "Eating out".
export const NoteModal = ({ visible, mealName, onClose, onSave }) => {
    const styles = useSheetStyles();
    const { colours } = useTheme();
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const save = async (value) => {
        const note = (value ?? text).trim();
        if (!note || saving) return;
        setSaving(true);
        setError('');
        const ok = await onSave(note);
        setSaving(false);
        if (ok) {
            setText('');
            onClose();
        } else {
            setError('Could not save. Please try again.');
        }
    };

    if (!visible) return null;

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.sheet}>
                    <AppHeaderText>{mealName}</AppHeaderText>
                    <View style={styles.suggestions}>
                        {QUICK_NOTES.map((note) => (
                            <TouchableOpacity key={note} style={styles.chip} onPress={() => save(note)}>
                                <Text style={styles.chipText}>{note}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <TextInput
                        style={styles.input}
                        placeholder="Or write your own"
                        placeholderTextColor={colours.secondaryText}
                        value={text}
                        onChangeText={setText}
                        maxLength={100}
                        returnKeyType="done"
                        onSubmitEditing={() => save()}
                    />
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    {saving ? <ActivityIndicator /> : <AppButton label="Save" onPress={() => save()} />}
                </Pressable>
            </Pressable>
        </Modal>
    );
};

// Move a planned meal to another day/meal; swaps with whatever is already there.
export const MoveModal = ({ visible, title, dates, currentDate, currentMealType, onClose, onMove }) => {
    const styles = useSheetStyles();
    const [mealType, setMealType] = useState(currentMealType);
    const [moving, setMoving] = useState(false);
    const [error, setError] = useState('');

    const move = async (date) => {
        if (moving) return;
        setMoving(true);
        setError('');
        const ok = await onMove(date, mealType);
        setMoving(false);
        if (ok) {
            onClose();
        } else {
            setError('Could not move this meal. Please try again.');
        }
    };

    if (!visible) return null;

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.sheet}>
                    <AppHeaderText>Move {title}</AppHeaderText>
                    <Text style={styles.label}>Meal</Text>
                    <View style={styles.suggestions}>
                        {MEAL_TYPES.map((meal) => (
                            <TouchableOpacity
                                key={meal.id}
                                style={[styles.chip, mealType === meal.id && styles.chipSelected]}
                                onPress={() => setMealType(meal.id)}
                            >
                                <Text style={styles.chipText}>{meal.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={styles.label}>Day (swaps with anything already planned)</Text>
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    {moving ? <ActivityIndicator /> : (
                        <FlatList
                            data={dates}
                            keyExtractor={(date) => date}
                            renderItem={({ item: date }) => {
                                const isCurrent = date === currentDate && mealType === currentMealType;
                                return (
                                    <TouchableOpacity
                                        style={[styles.day, isCurrent && styles.dayCurrent]}
                                        disabled={isCurrent}
                                        onPress={() => move(date)}
                                    >
                                        <Text style={styles.dayText}>
                                            {parseLocalDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );
};
