import { View, Text, TextInput, SafeAreaView, TouchableOpacity, Image, SectionList, StyleSheet, Platform, Keyboard, ActivityIndicator } from 'react-native';
import React, { useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react';
import useStyles from '../styles/Common';
import Checkbox from '../components/Checkbox';
import { supabase } from '../../supabase';
import { useTheme, useIsFocused } from '@react-navigation/native';
import AppHeaderText from '../components/AppHeaderText';
import { AuthContext, CacheContext } from '../../Contexts';
import GenerateListModal from '../components/GenerateListModal';
import Dropdown from '../components/Dropdown';

const getCategoryLabel = (category) => category || 'Uncategorised';

const List = ({ route }) => {
    const [items, setItems] = useState([]);
    const [newListItem, setNewListItem] = useState('');
    const [genModalOpen, setGenModalOpen] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [completedExpanded, setCompletedExpanded] = useState(false);
    const [editingItemId, setEditingItemId] = useState(null);
    const [currentList, setCurrentList] = useState(null);
    const [listsByType, setListsByType] = useState({});
    const [selectedListType, setSelectedListType] = useState('Personal');
    const [isPremium, setIsPremium] = useState(false);
    const [sharedWith, setSharedWith] = useState(null);
    const isFocused = useIsFocused();
    const [loadingItems, setLoadingItems] = useState(false);
    const sectionListRef = useRef(null);
    const session = useContext(AuthContext);
    const cacheContext = useContext(CacheContext);
    const cache = cacheContext?.cache;
    const { assets, colours } = useTheme();
    const styles = useStyles();

    const listStyles = StyleSheet.create({
        screen: {
            flex: 1
        },
        content: {
            flex: 1,
            alignItems: 'center'
        },
        header: {
            width: '100%',
            paddingHorizontal: 10,
            paddingBottom: 8,
            paddingTop: Platform.OS === 'android' ? 8 : 0,
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: 8
        },
        headerButton: {
            width: 36,
            height: 36
        },
        list: {
            width: '100%',
            paddingHorizontal: 8
        },
        sectionHeader: {
            paddingTop: 16,
            paddingBottom: 6
        },
        completedHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        clearText: {
            color: colours.secondaryText,
            fontSize: 14,
            paddingHorizontal: 4
        },
        sectionTitle: {
            color: colours.secondaryText,
            fontSize: 14,
            textTransform: 'uppercase'
        },
        itemContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            backgroundColor: colours.card,
            borderRadius: 4,
            marginVertical: 2,
            paddingLeft: 8
        },
        leftItemContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            flex: 1
        },
        quantityContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            marginRight: 12,
            minWidth: 96
        },
        quantityButton: {
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colours.layer,
            alignItems: 'center',
            justifyContent: 'center'
        },
        quantityButtonText: {
            color: colours.text,
            fontSize: 18,
            lineHeight: 20
        },
        quantityText: {
            color: colours.text,
            minWidth: 28,
            textAlign: 'center',
            marginHorizontal: 6,
            fontSize: 16,
            fontWeight: '600'
        },
        itemText: {
            color: colours.text,
            fontSize: 18,
            flex: 1,
            paddingVertical: 12
        },
        checkboxContainer: {
            padding: 8
        },
        footer: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: keyboardHeight > 0 ? keyboardHeight + (Platform.OS === 'android' ? 22 : 16) : 0,
            paddingHorizontal: 12,
            paddingVertical: 8
        },
        pillContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8
        },
        pillInput: {
            flex: 1,
            backgroundColor: colours.layer,
            borderRadius: 24,
            paddingHorizontal: 16,
            minHeight: 44
        },
        addInput: {
            flex: 1,
            color: colours.text,
            fontSize: 16
        },
        addButton: {
            height: 44,
            width: 44,
            borderRadius: 22,
            backgroundColor: colours.layer,
            alignItems: 'center',
            justifyContent: 'center'
        },
        button: {
            height: 32,
            width: 32
        },
        emptyState: {
            paddingTop: 24,
            alignItems: 'center'
        }
    });

    const getListItems = useCallback(async () => {
        if (!session?.user?.id || !currentList?.id) {
            return;
        }

        setLoadingItems(true);
        const { data, error } = await supabase
            .from('list_items')
            .select('*')
            .eq('list_id', currentList.id)
            .order('category', { ascending: true })
            .order('checked', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) {
            console.log(error);
            setLoadingItems(false);
            return;
        }

        setItems(data || []);
        setLoadingItems(false);
    }, [session?.user?.id, currentList?.id]);

    const sharingAvailable = isPremium || Boolean(sharedWith);

    const listOptions = useMemo(() => ([
        { id: 'Personal', label: 'Personal' },
        { id: 'Shared', label: 'Shared', disabled: !sharingAvailable }
    ]), [sharingAvailable]);

    const getPremiumStatus = useCallback(async () => {
        if (!session?.user?.id) {
            return false;
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('premium')
            .eq('id', session.user.id)
            .single();

        if (error) {
            console.log('Error fetching premium status:', error);
            setIsPremium(false);
            return false;
        }

        const premiumStatus = Boolean(data?.premium);
        setIsPremium(premiumStatus);
        return premiumStatus;
    }, [session?.user?.id]);

    // Personal list, plus either the shared list you've joined or your own Shared list.
    // The server creates any list that doesn't exist yet.
    const loadLists = useCallback(async () => {
        if (!session?.user?.id) {
            return;
        }

        void getPremiumStatus();

        const { data, error } = await supabase.rpc('get_my_lists');
        if (error) {
            console.log('Error loading lists:', error);
            return;
        }

        const byKind = Object.fromEntries((data || []).map((list) => [list.kind, list]));
        setListsByType(byKind);
        setSharedWith(byKind.Shared?.shared_with || null);
    }, [getPremiumStatus, session?.user?.id]);

    useEffect(() => {
        if (isFocused) {
            loadLists();
        }
    }, [loadLists, route.params?.action, cache, isFocused]);

    useEffect(() => {
        const list = listsByType[selectedListType];
        if (list) {
            setCurrentList(list);
        }
    }, [listsByType, selectedListType]);

    useEffect(() => {
        if (!sharingAvailable && selectedListType === 'Shared') {
            setSelectedListType('Personal');
        }
    }, [sharingAvailable, selectedListType]);

    useEffect(() => {
        if (currentList?.id) {
            getListItems();
        }
    }, [currentList?.id, getListItems]);

    useEffect(() => {
        if (!currentList?.id) {
            return;
        }

        // Subscribe to real-time changes for list items
        const channel = supabase
            .channel(`list_items:${currentList.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'list_items',
                    filter: `list_id=eq.${currentList.id}`
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setItems((currentItems) => {
                            // Avoid duplicates - check if item already exists
                            if (currentItems.some(item => item.id === payload.new.id)) {
                                return currentItems;
                            }
                            return [...currentItems, payload.new];
                        });
                    } else if (payload.eventType === 'UPDATE') {
                        setItems((currentItems) =>
                            currentItems.map((item) =>
                                item.id === payload.new.id ? payload.new : item
                            )
                        );
                    } else if (payload.eventType === 'DELETE') {
                        setItems((currentItems) =>
                            currentItems.filter((item) => item.id !== payload.old.id)
                        );
                    }
                }
            )
            .subscribe();

        // Cleanup subscription
        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentList?.id]);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSubscription = Keyboard.addListener(showEvent, (event) => {
            setKeyboardHeight(event.endCoordinates.height);
        });
        const hideSubscription = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
        });

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    const persistItemUpdate = async (id, values, rollbackItems) => {
        console.log('Updating item:', id, values);
        const { error } = await supabase
            .from('list_items')
            .update(values)
            .eq('id', id);

        if (error) {
            console.log('Update error:', error);
            if (rollbackItems) {
                setItems(rollbackItems);
            }
        } else {
            console.log('Update successful');
        }
    };

    const scrollToEditingItem = (itemId, sections) => {
        if (!sectionListRef.current) return;

        // Find the section and item index
        for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
            const itemIdx = sections[sectionIdx].data.findIndex((item) => item.id === itemId);
            if (itemIdx !== -1) {
                setTimeout(() => {
                    sectionListRef.current?.scrollToLocation({
                        sectionIndex: sectionIdx,
                        itemIndex: itemIdx,
                        viewPosition: keyboardHeight > 0 ? 0.2 : 0.5,
                        animated: true
                    });
                }, 100);
                break;
            }
        }
    };

    const onAddItem = async () => {
        const itemName = newListItem.trim();
        if (!itemName || !session?.user?.id || !currentList?.id) {
            return;
        }

        const tempId = `temp-${Date.now()}`;
        const optimisticItem = {
            id: tempId,
            item: itemName,
            category: null,
            quantity: 1,
            checked: false,
            user_id: session.user.id,
            list_id: currentList.id,
            created_at: new Date().toISOString()
        };

        setItems((currentItems) => [...currentItems, optimisticItem]);
        setNewListItem('');
        const { data, error } = await supabase.rpc('add_list_item', {
            p_item: itemName,
            p_quantity: 1,
            p_user_id: session.user.id,
            p_list_id: currentList.id
        });

        if (error) {
            console.log(error);
            setItems((currentItems) => currentItems.filter((item) => item.id !== tempId));
            setNewListItem(itemName);
            return;
        }

        setItems((currentItems) => currentItems.map((item) => (
            item.id === tempId ? data : item
        )));
    };

    const onItemTextChange = (id, text) => {
        setItems((currentItems) => currentItems.map((listItem) => (
            listItem.id === id ? { ...listItem, item: text } : listItem
        )));
    };

    const onItemTextSubmit = (id, text) => {
        const nextText = text.trim() || text;
        const rollbackItems = items;

        setItems((currentItems) => currentItems.map((listItem) => (
            listItem.id === id ? { ...listItem, item: nextText } : listItem
        )));
        void persistItemUpdate(id, { item: nextText }, rollbackItems);
    };

    const onItemCheck = (id) => {
        const rollbackItems = items;
        const currentItem = items.find((listItem) => listItem.id === id);
        if (!currentItem) {
            return;
        }

        const nextCheckedValue = !currentItem.checked;
        setItems((currentItems) => currentItems.map((listItem) => (
            listItem.id === id ? { ...listItem, checked: nextCheckedValue } : listItem
        )));
        void persistItemUpdate(id, { checked: nextCheckedValue }, rollbackItems);
    };

    const onQuantityChange = (id, delta) => {
        const rollbackItems = items;
        const currentItem = items.find((listItem) => listItem.id === id);
        if (!currentItem) {
            return;
        }

        const nextQuantity = Math.max(1, Number(currentItem.quantity || 1) + delta);
        if (nextQuantity === currentItem.quantity) {
            return;
        }

        setItems((currentItems) => currentItems.map((listItem) => (
            listItem.id === id ? { ...listItem, quantity: nextQuantity } : listItem
        )));
        void persistItemUpdate(id, { quantity: nextQuantity }, rollbackItems);
    };

    const onClearCompleted = async () => {
        const completedIds = items
            .filter((item) => item.checked && !String(item.id).startsWith('temp-'))
            .map((item) => item.id);
        if (completedIds.length === 0) {
            return;
        }

        const rollbackItems = items;
        setItems((currentItems) => currentItems.filter((item) => !completedIds.includes(item.id)));

        // RLS only lets users delete items they added; keep any that weren't deleted.
        const { data, error } = await supabase
            .from('list_items')
            .delete()
            .in('id', completedIds)
            .select('id');

        if (error) {
            console.log('Error clearing completed items:', error);
            setItems(rollbackItems);
            return;
        }

        const deletedIds = new Set((data || []).map((row) => row.id));
        if (deletedIds.size < completedIds.length) {
            setItems(rollbackItems.filter((item) => !deletedIds.has(item.id)));
        }
    };

    const sections = useMemo(() => {
        const checkedItems = [];
        const uncheckedItems = [];

        items.forEach((item) => {
            if (item.checked) {
                checkedItems.push(item);
            } else {
                uncheckedItems.push(item);
            }
        });

        const groupedUnchecked = uncheckedItems.reduce((acc, item) => {
            const key = getCategoryLabel(item.category);
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(item);
            return acc;
        }, {});

        const uncheckedSections = Object.keys(groupedUnchecked)
            .sort((a, b) => a.localeCompare(b))
            .map((title) => ({
                title,
                data: groupedUnchecked[title].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            }));

        if (checkedItems.length > 0) {
            uncheckedSections.push({
                title: 'Completed',
                data: completedExpanded ? checkedItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : [],
                isCollapsible: true
            });
        }

        return uncheckedSections;
    }, [items, completedExpanded]);

    const renderListItem = ({ item }) => (
        <View style={item.checked ? { opacity: 0.5 } : { opacity: 1 }}>
            <View style={listStyles.itemContainer}>
                <View style={listStyles.leftItemContainer}>
                    <View style={listStyles.quantityContainer}>
                        <TouchableOpacity
                            style={listStyles.quantityButton}
                            onPress={() => onQuantityChange(item.id, -1)}
                            disabled={item.checked}
                        >
                            <Text style={listStyles.quantityButtonText}>-</Text>
                        </TouchableOpacity>
                        <Text style={listStyles.quantityText}>{Number(item.quantity || 1)}</Text>
                        <TouchableOpacity
                            style={listStyles.quantityButton}
                            onPress={() => onQuantityChange(item.id, 1)}
                            disabled={item.checked}
                        >
                            <Text style={listStyles.quantityButtonText}>+</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={listStyles.itemText}
                        value={item.item}
                        onChangeText={(text) => onItemTextChange(item.id, text)}
                        onEndEditing={(event) => onItemTextSubmit(item.id, event.nativeEvent.text)}
                        onFocus={() => {
                            setEditingItemId(item.id);
                            scrollToEditingItem(item.id, sections);
                        }}
                        onBlur={() => setEditingItemId(null)}
                        editable={!item.checked}
                    />
                </View>
                <View style={listStyles.checkboxContainer}>
                    <Checkbox
                        onPress={() => onItemCheck(item.id)}
                        isChecked={Boolean(item.checked)}
                    />
                </View>
            </View>
        </View>
    );

    const renderSectionHeader = ({ section }) => {
        const isCollapsible = section.isCollapsible;
        return (
            <TouchableOpacity
                onPress={() => isCollapsible && setCompletedExpanded(!completedExpanded)}
                disabled={!isCollapsible}
            >
                <View style={[listStyles.sectionHeader, isCollapsible && listStyles.completedHeader]}>
                    <Text style={listStyles.sectionTitle}>
                        {isCollapsible && (completedExpanded ? '▼ ' : '▶ ')}
                        {section.title}
                    </Text>
                    {isCollapsible ? (
                        <TouchableOpacity
                            onPress={onClearCompleted}
                            accessibilityRole="button"
                            accessibilityLabel="Clear completed items"
                            hitSlop={8}
                        >
                            <Text style={listStyles.clearText}>Clear</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={listStyles.screen}>
                <View style={listStyles.content}>
                    <View style={listStyles.header}>
                        <AppHeaderText>List</AppHeaderText>
                        <View style={{ maxWidth: 120, marginLeft: 'auto' }}>
                            <Dropdown
                                data={listOptions}
                                onSelect={(selected) => setSelectedListType(selected.id)}
                                value={listOptions.findIndex((list) => list.id === selectedListType)}
                                compact={true}
                            />
                        </View>
                        <TouchableOpacity onPress={() => setGenModalOpen(true)}>
                            <Image
                                source={assets.list_gen}
                                style={listStyles.headerButton}
                            />
                        </TouchableOpacity>
                    </View>
                    {selectedListType === 'Shared' && sharedWith ? (
                        <Text style={[styles.lowImpactText, { alignSelf: 'flex-start', paddingHorizontal: 12 }]}>
                            Shared with {sharedWith}
                        </Text>
                    ) : null}
                    {loadingItems ? (
                        <View style={[listStyles.emptyState, { paddingTop: 80 }]}>
                            <ActivityIndicator size="large" color={colours.text} />
                            <Text style={[styles.lowImpactText, { marginTop: 12 }]}>Loading items...</Text>
                        </View>
                    ) : (
                        <SectionList
                            ref={sectionListRef}
                            style={listStyles.list}
                            sections={sections}
                            renderItem={renderListItem}
                            extraData={items}
                            renderSectionHeader={renderSectionHeader}
                            keyExtractor={(item) => String(item.id)}
                            contentContainerStyle={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 120 : 88 }}
                            ListEmptyComponent={(
                                <View style={listStyles.emptyState}>
                                    <Text style={styles.lowImpactText}>Add some items.</Text>
                                </View>
                            )}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        />
                    )}
                </View>
                <View style={listStyles.footer}>
                    <View style={listStyles.pillContainer}>
                        <View style={listStyles.pillInput}>
                            <TextInput
                                style={listStyles.addInput}
                                placeholder="Add an item"
                                placeholderTextColor={colours.secondaryText}
                                onChangeText={(text) => setNewListItem(text)}
                                value={newListItem}
                                onSubmitEditing={onAddItem}
                                returnKeyType="done"
                            />
                        </View>
                        <TouchableOpacity style={listStyles.addButton} onPress={onAddItem}>
                            <Image
                                style={listStyles.button}
                                source={assets.add}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            <GenerateListModal
                genModalOpen={genModalOpen}
                setGenModalOpen={setGenModalOpen}
                onGenerated={getListItems}
                listId={currentList?.id}
                listName={selectedListType}
            />
        </SafeAreaView>
    );
};

export default List;
