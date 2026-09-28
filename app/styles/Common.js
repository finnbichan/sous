import { StyleSheet, Platform } from 'react-native';
import { useTheme } from '@react-navigation/native';
import React from 'react';

const Styles = (props) => StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: props.colours.background,
      paddingTop: Platform.OS === 'android' ? 50 : 0
    },
    content: {
      alignItems: "center",
      justifyContent: "center"
    },
    title: {
      fontSize: 30,
      marginTop: 10,
      fontWeight: "bold",
      color: props.colours.text,
      maxWidth: 300,
      textAlign: 'left'
     },
     multiItemContainer: {
        padding: 10,
        borderRadius: 4,
        marginVertical: 4,
        marginHorizontal: 8
    },
    text: {
      color: props.colours.text,
      fontSize: 16
    },
    input: {
      width: '95%',
      marginLeft: 8,
      backgroundColor: props.colours.card,
      borderRadius: 4,
      color: props.colours.text,
      marginVertical: 2,
    },
    buttonsParent: {
      flexDirection: "row"
    },
    buttonParent: {
      alignItems: "center",
    },
    button: {
      backgroundColor: props.colours.card,
      marginHorizontal: 8,
      borderRadius: 4,
      paddingVertical: 4,
      paddingHorizontal: 8
    },
    helperText: {
      color: "#a9a9a9",
      fontSize: 14,
      marginVertical: 2,
      marginHorizontal: 8,
    },
    logOutButton: {
      backgroundColor: "#b22222",
      borderColor: "#b22222",
      marginHorizontal: 8,
      borderWidth: 1,
      borderRadius: 4,
      paddingVertical: 4,
      paddingHorizontal: 8
    },
    calendar: {
      backgroundColor: "#ffffff",
      borderRadius: 4,
      borderColor: "#000",
      borderWidth: 1,
      width: 400,
      minWidth: "90%",
      height: 320,
      flexGrow: 0,
      marginTop: 8
    },
    calendarCard: {
      borderColor: "#000",
      borderBottomWidth: 1
    },
    recipeCard: {
      flexDirection: 'row'
    },
    circularButton: {
      backgroundColor: "#000000",
      borderWidth: 1,
      borderRadius: '50%',
      marginHorizontal: 8,
      marginVertical: 2,
      width: 40,
      height: 40
    },
    recipeButtons: {
      flexDirection: "row",
      marginLeft: 'auto'
    },
    icons: {
      width: 37.5,
      height: 37.5,
      maxWidth: 37.5,
      maxHeight: 37.5
    },
    icon: {
      width: 36,
      height: 36
    },
    recipeList: {
      minWidth: "90%",
      marginBottom: '-5',
      paddingHorizontal: 4
    },
    descriptorsParent: {
      flexDirection: "row"
    },
    descriptors: {
      backgroundColor: props.colours.layer,
      borderRadius: 8,
      marginHorizontal: 2,
      marginVertical: 2,
      paddingHorizontal: 4,
      paddingVertical: 2 
  },
  descriptorText : {
      color: props.colours.text,
  },
  overlay: {
    height: '100%',
    width: "100%",
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)'
  },
  modal: {
    backgroundColor: props.colours.background,
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
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    padding: 4,
    paddingTop: 12
  },
  userRecipesTitleBox: {
    paddingBottom: 10
  },
  recipeTitleBox: {
    //flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%'
  },
  addButton: {
    maxHeight: 32,
    maxWidth: 32,
    //marginTop: 5
  },
  editButton: {
    maxHeight: 40,
    maxWidth: 40,
    marginTop: 10
  },
  lowImpactText: {
    color: props.colours.secondaryText
  },
  errorText: {
    color: '#b22222',
    alignSelf: 'flex-start',
    marginHorizontal: 12,
    marginTop: 8
  },
  deleteButton: {
    backgroundColor: props.colours.background,
    borderRadius: 8,
    alignSelf: 'flex-end',
    margin: 12
  },
  footer: {
    bottom: 0,
    position: 'absolute',
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  stepButton: {
        marginHorizontal: 8,
        alignSelf: 'flex-end',
        backgroundColor: props.colours.card,
        borderRadius: 4,
        marginVertical: 8,
        marginHorizontal: 12,
    }
  });

  function useStyles() {
    const { colours } = useTheme();
    const styles = React.useMemo(() => Styles({ colours }), [colours]);
    return styles;
  }
   export default useStyles;
