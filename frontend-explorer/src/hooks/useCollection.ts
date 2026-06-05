"use client";

import { useState, useEffect } from "react";

export function useCollection() {
  const [collection, setCollection] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("wolfsonian_lakehouse_collection");
      if (saved) {
        setCollection(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load collection from localStorage", e);
    }
    setIsLoaded(true);
  }, []);

  const updateCollection = (newCollection: any[]) => {
    setCollection(newCollection);
    try {
      window.localStorage.setItem("wolfsonian_lakehouse_collection", JSON.stringify(newCollection));
    } catch (e) {
      console.error("Failed to save collection to localStorage", e);
    }
  };

  const addItem = (item: any) => {
    if (!isInCollection(item.field_identifier)) {
      updateCollection([...collection, item]);
    }
  };

  const removeItem = (identifier: string) => {
    updateCollection(collection.filter((i) => i.field_identifier !== identifier));
  };

  const clearCollection = () => {
    updateCollection([]);
  };

  const isInCollection = (identifier: string) => {
    return collection.some((i) => i.field_identifier === identifier);
  };

  const exportCsv = () => {
    if (collection.length === 0) return;
    
    // Export all available fields as requested
    const headers = [
      "field_identifier", "title", "field_collection_type", "field_genre",
      "field_description_long", "field_linked_agent", "field_subject", 
      "field_place_published", "field_edtf_date_created", "decade_created", 
      "year_created", "field_credit_line", "field_physical_form", 
      "field_extent", "field_collection_note", "source_system", "id"
    ];
    
    // Add custom columns for thumbnails
    const exportHeaders = [...headers, "image_url", "spreadsheet_thumbnail"];
    
    const csvRows = [];
    
    // Add headers
    csvRows.push(exportHeaders.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
    
    // Add rows
    for (const row of collection) {
      const primaryId = (row.field_identifier || "").split(';')[0].trim();
      const imageUrl = row.has_image ? `https://lakehouse.wolfsonian.org/images/${primaryId}.jpg` : "";
      
      const values = exportHeaders.map(header => {
        let val = "";
        
        if (header === "image_url") {
          val = imageUrl;
        } else if (header === "spreadsheet_thumbnail") {
          // This formula renders the actual image inside a cell in Google Sheets and newer Excel versions!
          val = imageUrl ? `=IMAGE("${imageUrl}")` : "";
        } else {
          val = row[header];
        }
        
        const escaped = (val === null || val === undefined) ? "" : String(val).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `lakehouse_collection_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return {
    collection,
    isLoaded,
    addItem,
    removeItem,
    clearCollection,
    isInCollection,
    exportCsv
  };
}
