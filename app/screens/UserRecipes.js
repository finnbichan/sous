import { View, Text, SafeAreaView, ActivityIndicator, FlatList, TouchableOpacity, Image, TextInput } from 'react-native';
import React, { useEffect, useState, useContext, useMemo } from 'react';
import useStyles from '../styles/Common';
import Recipe from '../components/RecipeOverview';
import { supabase } from '../../supabase';
import { AuthContext, CacheContext } from '../../Contexts';
import AppHeaderText from '../components/AppHeaderText';
import { MealActionsSheet } from '../components/MealSlotModals';
import { ImportRecipeSheet } from '../components/RecipeImport';
import { useTheme } from '@react-navigation/native';
import Dropdown from '../components/Dropdown';


const ListEmpty = () => {  
    const styles = useStyles();
    return (
        <View>
            <Text style={styles.lowImpactText}>No recipes yet! Click + to add your own or head over the Explore page for inspiration!</Text>
        </View>
    )
}

const ListHeader = ({
    onAdd,
    searchText,
    setSearchText,
    filtersOpen,
    setFiltersOpen,
    cuisineFilter,
    setCuisineFilter,
    timeFilter,
    setTimeFilter,
    vegetarianFilter,
    setVegetarianFilter
}) => {
    const {assets, colours} = useTheme();
    const styles = useStyles();
    const cuisineOptions = [{ id: 0, label: 'Any' }, ...cuisineList.map((item, index) => ({ id: index + 1, label: item.label }))];
    const timeOptions = [{ id: 0, label: 'Any' }, ...easeList.map((item, index) => ({ id: index + 1, label: item.label }))];
    const vegetarianOptions = [{ id: 0, label: 'Any' }, { id: 1, label: 'Veggie' }, { id: 2, label: 'Vegan' }];

    return (
    <View style={{width: '100%', paddingLeft: 8, paddingRight: 8}}>
        <View style={{paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
            <AppHeaderText>Your recipes</AppHeaderText>
            <View style={{flexDirection: 'row'}}>
                <TouchableOpacity
                onPress={onAdd}
                accessibilityRole="button"
                accessibilityLabel="Add a recipe"
                hitSlop={8}
                >
                    <Image source={assets.add} style={{height: 32, width: 32, marginRight: 10}} />
                </TouchableOpacity>
            </View>
        </View>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10}}>
            <TextInput
            style={{paddingHorizontal: 10, backgroundColor: colours.card, flexGrow: 1, borderRadius: 8, marginRight: 16, color: colours.text, alignContent: 'center'}}
            placeholder="Search"
            placeholderTextColor={colours.secondaryText}
            value={searchText}
            onChangeText={setSearchText}
            />
            <TouchableOpacity
                style={{marginRight: 0}}
                onPress={() => setFiltersOpen(!filtersOpen)}>
                    <Image
                    source={assets.filter}
                    style={styles.icon}
                    />
                </TouchableOpacity>
        </View>
        {filtersOpen ? (
            <View style={{paddingVertical: 4, marginRight: 0, marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Dropdown
                data={cuisineOptions}
                label="Cuisine"
                onSelect={(selected) => setCuisineFilter(selected.id)}
                value={cuisineFilter === 0 ? undefined : cuisineFilter}
                compact={true}
                style={{marginRight: 8}}
                />
                <Dropdown
                data={timeOptions}
                label="Time"
                onSelect={(selected) => setTimeFilter(selected.id)}
                value={timeFilter === 0 ? undefined : timeFilter}
                compact={true}
                style={{marginRight: 8}}
                />
                <Dropdown
                data={vegetarianOptions}
                label="Diet"
                onSelect={(selected) => setVegetarianFilter(selected.id)}
                value={vegetarianFilter === 0 ? undefined : vegetarianFilter}
                compact={true}
                />
                </View>
            </View>
        ) : null}
    </View>
    )
}

const UserRecipes = ({route, navigation}) => {
    const {cache, setCache} = useContext(CacheContext)
    const [loading, setLoading] = useState(true);
    const [recipes, setRecipes] = useState(undefined);
    const [searchText, setSearchText] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [cuisineFilter, setCuisineFilter] = useState(0);
    const [timeFilter, setTimeFilter] = useState(0);
    const [vegetarianFilter, setVegetarianFilter] = useState(0);
    // null | 'menu' | 'import'
    const [addSheet, setAddSheet] = useState(null);
    const { assets } = useTheme();
    const session = useContext(AuthContext)
    const styles = useStyles();

    const getRecipes = async () => {
        console.log("fetching")
        const {data, error} = await supabase
        .rpc('get_user_recipes', {p_user_id: session.user.id})
        if (error) {
            console.log("error", error)
            return
        } else {
            setRecipes(data)
            setLoading(false)
        }
    }

    useEffect(() => {
        getRecipes()
    }, [cache])

    const filteredRecipes = useMemo(() => {
        const recipeList = recipes || [];
        const normalizedSearchText = searchText.trim().toLowerCase();

        return recipeList.filter((recipe) => {
            const matchesSearch = !normalizedSearchText || recipe.name?.toLowerCase().includes(normalizedSearchText);
            const matchesCuisine = cuisineFilter === 0 || Number(recipe.cuisine) === cuisineFilter - 1;
            const matchesTime = timeFilter === 0 || Number(recipe.ease) === timeFilter - 1;
            const matchesVegetarian = vegetarianFilter === 0 || Number(recipe.diet) === vegetarianFilter;

            return matchesSearch && matchesCuisine && matchesTime && matchesVegetarian;
        });
    }, [recipes, searchText, cuisineFilter, timeFilter, vegetarianFilter]);

    const renderRecipe = ({item}) => {
        return (
            <View>
                <Recipe
                recipe={item}
                navigation={navigation}
                />
            </View>
        )
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <ListHeader
                onAdd={() => setAddSheet('menu')}
                searchText={searchText}
                setSearchText={setSearchText}
                filtersOpen={filtersOpen}
                setFiltersOpen={setFiltersOpen}
                cuisineFilter={cuisineFilter}
                setCuisineFilter={setCuisineFilter}
                timeFilter={timeFilter}
                setTimeFilter={setTimeFilter}
                vegetarianFilter={vegetarianFilter}
                setVegetarianFilter={setVegetarianFilter}
                />
                {loading ? (
                    <ActivityIndicator/>
                ) : (
                    <FlatList
                    data={filteredRecipes}
                    renderItem={renderRecipe}
                    keyExtractor={item => item.recipe_id}
                    extraData={loading}
                    style={[styles.recipeList, { width: '100%', paddingHorizontal: 0 }]}
                    showsVerticalScrollIndicator={false}
                    scrollIndicatorInsets={{ right: -4 }}
                    ListEmptyComponent={<ListEmpty />}
                    contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 120 }}
                    />
                )}
            </View>
            <MealActionsSheet
                visible={addSheet === 'menu'}
                title="Add a recipe"
                actions={[
                    { label: 'Add manually', icon: assets.edit, onPress: () => {
                        setAddSheet(null);
                        navigation.navigate('Add a recipe', {prevScreen: 'Recipes'});
                    } },
                    { label: 'Import from a link', icon: assets.search, onPress: () => setAddSheet('import') }
                ]}
                onClose={() => setAddSheet(null)}
            />
            <ImportRecipeSheet
                visible={addSheet === 'import'}
                onClose={() => setAddSheet(null)}
                onImported={(prefill) => {
                    setAddSheet(null);
                    navigation.navigate('Add a recipe', {prevScreen: 'Recipes', prefill});
                }}
            />
        </SafeAreaView>
    )
}

export default UserRecipes;
