import { Modal, Pressable, View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import React from 'react';
import { useTheme } from '@react-navigation/native';
import AppHeaderText from './AppHeaderText';

// Bottom sheet for one shopping list item: move it to another category or delete it.
const ListItemActions = ({ item, categories, onClose, onChangeCategory, onDelete }) => {
    const { colours } = useTheme();

    const sheetStyles = StyleSheet.create({
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
            maxHeight: '70%'
        },
        label: {
            color: colours.secondaryText,
            fontSize: 14,
            marginTop: 8,
            marginBottom: 8,
            marginLeft: 4
        },
        category: {
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 16,
            backgroundColor: colours.card,
            marginBottom: 6
        },
        selected: {
            backgroundColor: colours.layer
        },
        categoryText: {
            color: colours.text,
            fontSize: 16,
            textTransform: 'capitalize'
        },
        deleteButton: {
            marginTop: 12,
            paddingVertical: 14,
            borderRadius: 16,
            alignItems: 'center',
            backgroundColor: colours.card
        },
        deleteText: {
            color: '#EF4444',
            fontSize: 16
        }
    });

    if (!item) return null;

    const options = [...categories, null];

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={sheetStyles.overlay} onPress={onClose}>
                <Pressable style={sheetStyles.sheet}>
                    <AppHeaderText>{item.item}</AppHeaderText>
                    <Text style={sheetStyles.label}>Category</Text>
                    <FlatList
                        data={options}
                        keyExtractor={(category) => category ?? 'uncategorised'}
                        renderItem={({ item: category }) => (
                            <TouchableOpacity
                                style={[sheetStyles.category, (item.category ?? null) === category && sheetStyles.selected]}
                                onPress={() => onChangeCategory(item, category)}
                            >
                                <Text style={sheetStyles.categoryText}>{category ?? 'Uncategorised'}</Text>
                            </TouchableOpacity>
                        )}
                    />
                    <TouchableOpacity style={sheetStyles.deleteButton} onPress={() => onDelete(item)}>
                        <Text style={sheetStyles.deleteText}>Delete item</Text>
                    </TouchableOpacity>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

export default ListItemActions;
