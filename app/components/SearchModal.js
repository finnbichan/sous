import { Modal, Pressable, View, TextInput, Text, StyleSheet, KeyboardAvoidingView, FlatList, TouchableOpacity, Image } from 'react-native';
import React, { useState, useContext, useRef } from 'react';
import { AuthContext } from '../../Contexts';
import { supabase } from '../../supabase';
import useStyles from '../styles/Common';
import RecipeBase from './RecipeBase';
import { useTheme } from '@react-navigation/native';



const NoResults = () => {
    const styles = useStyles();
    return (
            <Text style={styles.lowImpactText}>No results found</Text>
    )
}

const SearchModal = ( {searchModalOpen, setSearchModalOpen, onSelectRecipe, meal_type, date} ) => {
    const [searchText, setSearchText] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);
    const { assets, colours } = useTheme();
    const styles = useStyles();
    const modalStyles = StyleSheet.create({
        overlay: {
            height: '100%',
            width: "100%",
            justifyContent: 'flex-start',
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
            marginTop: '200',
            position: 'absolute',
            borderRadius: 8,
            flexGrow: 0
        },
        searchBox: {
            backgroundColor: colours.card,
            borderRadius: 4,
            padding: 2,
            width: '100%',
            height: '50',
            color: colours.text,
            margin: 10,
            paddingHorizontal: 10,
            fontSize: 16
        },
        modalTitle: {
            color: colours.text,
            fontSize: 18,
            marginBottom: 4,
            textAlign: 'left',
        },
        itemContainer: {
            backgroundColor: colours.card,
            borderRadius: 4,
            padding: 4,
            margin: 1,
            flexDirection: 'row',
            flexGrow: 1,
            maxWidth: '99%',
            marginBottom: 2,
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        addIcon: {
            height: 32,
            width: 32,
            marginHorizontal: 8
        },
        recipeContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            width: '100%',
            backgroundColor: colours.card,
            borderRadius: 4,
            marginVertical: 2,
            padding: 4,
            alignItems: 'center'
        }
    })

    const session = useContext(AuthContext);

    //workaround https://github.com/callstack/react-native-paper/issues/4456
    const handleInputAutofocus = () => {
        const timeout = setTimeout(()=>{
          inputRef.current.focus();
        }, 10)
        return ()=>clearTimeout(timeout)
    }
    const searchRecipes = async (text) => {
        setLoading(true);
        console.log("searching for", text)
        const { data, error } = await supabase
            .rpc('search_recipes_by_name', {p_user_id: session.user.id, p_search_term: text})
        if (error) {
            console.error(error);
        } else {
            console.log("search results", data);
            setSearchResults(data);
        }
        setLoading(false);
    }

    const selectRecipe = (recipe) => {
        onSelectRecipe(recipe, meal_type, date);
        console.log("hello")
        setSearchModalOpen(false);
    }

    const renderSearchResults = ({ item }) => {
        return (
            <TouchableOpacity
            style={modalStyles.recipeContainer}
            onPress={() => selectRecipe(item)}
            >
                <RecipeBase
                recipe={item}
                />
                <Image 
                style={modalStyles.addIcon}
                source={assets.add}
                /> 
            </TouchableOpacity>
        )
    }

   if (searchModalOpen) {
               return (
                   <Modal 
                   visible={searchModalOpen} 
                   animationType='none'
                   transparent
                   onShow={handleInputAutofocus}
                   >
                       <Pressable
                       style={modalStyles.overlay}
                       onPress={() => {setSearchModalOpen(false);setSearchResults([])}}
                       />
                       <KeyboardAvoidingView 
                       style={modalStyles.modal}
                       keyboardVerticalOffset={100}
                       >
                            <Text style={modalStyles.modalTitle}>Search your recipes</Text>
                            <TextInput
                            ref={(ref)=>inputRef.current=ref} 
                            style={modalStyles.searchBox}
                            onChangeText={(text) => {
                                setSearchText(text);
                                if (text.length > 2) {
                                    console.log("searching")
                                    searchRecipes(text);
                                } else {
                                    setSearchResults([]);
                                }}}
                            />
                            {searchText && searchText.length > 2 ?
                                <FlatList
                                data={searchResults}
                                renderItem={renderSearchResults}
                                keyExtractor={(item) => item.recipe_id.toString()}
                                ListEmptyComponent={NoResults}
                                keyboardShouldPersistTaps="handled"
                                />
                            : <Text style={styles.lowImpactText}>Type at least 3 characters to search</Text>}
                       </KeyboardAvoidingView>
                   </Modal>
               )
           }
}

export default SearchModal;